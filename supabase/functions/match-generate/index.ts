/**
 * match-generate — HTTP wrapper
 *
 * Async-by-default contract:
 *   - Regular kicks (no is_extra_match) do NOT run the matcher inline.
 *     The role is validated (exists; caller owns it unless service-role) and
 *     enqueued into match_queue at priority 10 — above the bulk-rematch
 *     priority 5, so interactive kicks drain first. process-match-queue
 *     (pg_cron every 1m) drains the queue calling matchForRole from
 *     _shared/match-core.ts, so match_approval_mode gating, refresh limits
 *     and the 3-active-match cap all still apply at drain time (≤1m later).
 *     Response: { message: 'queued', matches_added: 0, enqueued: n } — a
 *     superset of the old { message, matches_added } shape.
 *   - is_extra_match=true (PAID extra-match delivery: redeem-points /
 *     unlock-extra-match / payment-webhook) stays SYNCHRONOUS. Those callers
 *     read matches_added to couple charge to fulfilment, and match_queue has
 *     no extra-match columns.
 *
 * All matching logic lives in _shared/match-core.ts (matchForRole); the
 * queue worker (process-match-queue) imports it directly, so there is zero
 * code duplication between the two call paths.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { enforceRateLimit, RateLimitError } from '../_shared/ratelimit.ts'
import { matchForRole, MatchError } from '../_shared/match-core.ts'
import { reportError } from '../_shared/observe.ts'

interface Body { role_id?: string; is_extra_match?: boolean; source_purchase_id?: string }

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['hiring_manager', 'hr_admin', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* empty body tolerated */ }
  if (!body.role_id) return json({ error: 'Missing role_id' }, 400)

  // Per-user rate limit (20 req/hour) before the expensive matching run.
  // Internal service-role calls (redeem-points, process-match-queue) are not a
  // real end user and share the sentinel id, so they are not throttled.
  if (!auth.isServiceRole) {
    try {
      await enforceRateLimit(adminClient(), 'match-generate:' + auth.userId, 20, 3600)
    } catch (e) {
      if (e instanceof RateLimitError) return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(e.retryAfterSeconds ?? 3600) })
      throw e
    }
  }

  // ── PAID extra-match delivery — stays synchronous ─────────────────────────
  // redeem-points / unlock-extra-match / payment-webhook await this response
  // and read matches_added to couple the charge to the fulfilment.
  if (body.is_extra_match === true) {
    try {
      const result = await matchForRole({
        roleId:       body.role_id,
        isExtraMatch: body.is_extra_match === true,
        sourcePurchaseId: body.source_purchase_id,
        isServiceRole: auth.isServiceRole,
        callerUserId:  auth.userId,
      })
      return new Response(
        JSON.stringify({ message: result.message ?? 'OK', matches_added: result.matches_added }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } catch (err) {
      if (err instanceof MatchError) {
        return json({ error: err.message }, err.statusCode)
      }
      const msg = err instanceof Error ? err.message : String(err)
      await reportError(err, { fn: 'match-generate', role_id: body.role_id, is_extra_match: body.is_extra_match === true })
      return json({ error: msg }, 500)
    }
  }

  // ── Regular kick — enqueue instead of running the matcher inline ──────────
  const db = adminClient()

  // Role existence: same error/status matchForRole raises for a missing role
  // (match-core.ts ~L157: MatchError('Role not found', 404)).
  const { data: role, error: roleErr } = await db
    .from('roles')
    .select('id, hiring_manager_id')
    .eq('id', body.role_id).single()
  if (roleErr || !role) return json({ error: 'Role not found' }, 404)

  // Ownership gate, replicated from match-core.ts ~L315-319 — same query,
  // same 403 message. Skipped for service-role callers; match-core has NO
  // admin bypass here, so a user-JWT admin kicking someone else's role got
  // 403 on the synchronous path and still gets 403 now.
  if (!auth.isServiceRole && auth.userId) {
    const { data: hmOwner } = await db.from('hiring_managers')
      .select('id').eq('id', role.hiring_manager_id).eq('profile_id', auth.userId).maybeSingle()
    if (!hmOwner) return json({ error: 'Not the role owner' }, 403)
  }

  // Priority 10 > bulk-rematch priority 5 (match_queue drains priority DESC),
  // so user-initiated kicks are picked up first. The RPC (migration 0167)
  // skips inactive / vacancy-expired roles and dedups against pending or
  // processing queue items, so enqueued may legitimately be 0.
  const { data: n, error: enqErr } = await db.rpc('enqueue_roles_for_rematch', {
    p_role_ids: [body.role_id],
    p_priority: 10,
  })
  if (enqErr) {
    await reportError(new Error(`enqueue_roles_for_rematch failed: ${enqErr.message}`), { fn: 'match-generate', role_id: body.role_id, is_extra_match: false })
    return json({ error: `enqueue_roles_for_rematch failed: ${enqErr.message}` }, 500)
  }
  return json({ message: 'queued', matches_added: 0, enqueued: typeof n === 'number' ? n : 0 }, 200)
})
