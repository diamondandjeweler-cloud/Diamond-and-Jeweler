/**
 * redeem-points
 *
 * Spend Diamond Points to unlock 1 extra match.
 *
 * Body:
 *   { target_type: 'role',   role_id:   uuid }   — HM unlocks an extra match on their role
 *   { target_type: 'talent', talent_id?: uuid } — Talent unlocks an extra match for themselves
 *                                                  (defaults to caller's own talent profile)
 *
 * - Cost: system_config['points_per_extra_match'] (default 21)
 * - Quota cap: system_config['extra_match_cap_per_role' | 'extra_match_cap_per_talent']
 *   (default 3) — same cap as paid extra matches.
 * - Idempotency: deduction is keyed on `redeem:{target_type}:{target_id}:{used_count}` so
 *   double-clicks don't double-charge.
 * - On success: increments the relevant `extra_matches_used` counter and fires
 *   match-generate with is_extra_match=true.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { enforceRateLimit, RateLimitError } from '../_shared/ratelimit.ts'
import { withIdempotency } from '../_shared/idempotency.ts'
import { reportError } from '../_shared/observe.ts'

interface Body {
  target_type?: 'role' | 'talent'
  role_id?: string
  talent_id?: string
  /** Legacy: original API only accepted role_id (HM-only). */
}

// Wrapped so any uncaught throw in the handler is reported to the edge error
// sink before propagating. Re-throws unchanged — status/response/control flow
// are byte-for-byte identical to the bare handler (purely additive telemetry).
serve(async (req) => {
  try {
    return await handler(req)
  } catch (e) {
    await reportError(e, { fn: 'redeem-points' })
    throw e
  }
})

async function handler(req: Request): Promise<Response> {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['talent', 'hiring_manager', 'admin'],
  })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* tolerate */ }

  // Backward-compat: if only role_id is supplied, treat as HM redemption.
  let targetType = body.target_type
  if (!targetType) targetType = body.role_id ? 'role' : 'talent'

  // Per-user rate limit (20 req/hour) before any points deduction or quota bump.
  try {
    await enforceRateLimit(adminClient(), 'redeem-points:' + auth.userId, 20, 3600)
  } catch (e) {
    if (e instanceof RateLimitError) return json({ error: 'rate_limited' }, 429)
    throw e
  }

  const db = adminClient()

  // Request-level idempotency: a client-supplied Idempotency-Key de-dupes the
  // whole redeem body (ownership/quota resolution, points deduction, quota bump,
  // match-generate fire). The DB-level guards remain authoritative — the
  // redeem_points_for RPC is itself idempotent on `redeem:{target}:{used}`, and
  // the quota bump uses an optimistic-concurrency guard — so this only avoids a
  // redundant second pass / second match-generate call on a double-submit.
  const idemKey = req.headers.get('Idempotency-Key')
  const result = await withIdempotency(db, idemKey, auth.userId, 'redeem-points', async () => {
    // Cost.
    const { data: costCfg } = await db.from('system_config').select('value')
      .eq('key', 'points_per_extra_match').maybeSingle()
    const cost = typeof costCfg?.value === 'number' ? costCfg.value : 21

    // Resolve target + verify ownership + read current quota.
    let roleId: string | null = null
    let talentId: string | null = null
    let used = 0
    let cap = 3

    if (targetType === 'role') {
      if (!body.role_id) return { _status: 400, _body: { error: 'role_id required' } }
      if (auth.role === 'talent') return { _status: 403, _body: { error: 'Talents cannot redeem on a role' } }

      const { data: role } = await db.from('roles')
        .select('id, hiring_manager_id, extra_matches_used, status')
        .eq('id', body.role_id).maybeSingle()
      if (!role) return { _status: 404, _body: { error: 'Role not found' } }
      if (role.status !== 'active') return { _status: 400, _body: { error: `Role is ${role.status}` } }

      if (auth.role !== 'admin') {
        const { data: hm } = await db.from('hiring_managers')
          .select('id').eq('id', role.hiring_manager_id).eq('profile_id', auth.userId)
          .maybeSingle()
        if (!hm) return { _status: 403, _body: { error: 'Not the role owner' } }
      }
      roleId = role.id
      used = role.extra_matches_used ?? 0

      const { data: capCfg } = await db.from('system_config').select('value')
        .eq('key', 'extra_match_cap_per_role').maybeSingle()
      if (typeof capCfg?.value === 'number') cap = capCfg.value
    } else {
      // Talent redemption — defaults to caller's own talent profile.
      let tid = body.talent_id ?? null
      if (!tid) {
        const { data: t } = await db.from('talents').select('id')
          .eq('profile_id', auth.userId).maybeSingle()
        tid = t?.id ?? null
      }
      if (!tid) return { _status: 404, _body: { error: 'Talent profile not found' } }

      const { data: talent } = await db.from('talents')
        .select('id, profile_id, extra_matches_used').eq('id', tid).maybeSingle()
      if (!talent) return { _status: 404, _body: { error: 'Talent not found' } }
      if (auth.role === 'talent' && talent.profile_id !== auth.userId) {
        return { _status: 403, _body: { error: 'Cannot redeem for another talent' } }
      }
      if (auth.role === 'hiring_manager') {
        return { _status: 403, _body: { error: 'Hiring managers redeem against a role, not a talent' } }
      }
      talentId = talent.id
      used = talent.extra_matches_used ?? 0

      const { data: capCfg } = await db.from('system_config').select('value')
        .eq('key', 'extra_match_cap_per_talent').maybeSingle()
      if (typeof capCfg?.value === 'number') cap = capCfg.value
    }

    if (used >= cap) {
      return { _status: 400, _body: { error: 'Extra match quota exhausted', used, cap } }
    }

    // Deduct points with a balance check + an idempotency key derived from the
    // current `used` value. The RPC is idempotent on the key, so a double-click
    // from the UI replays the same key and is not double-charged.
    const idempotencyKey = `redeem:${targetType}:${roleId ?? talentId}:${used}`

    const { data: redeemResult, error: redeemErr } = await db.rpc('redeem_points_for', {
      p_user_id: auth.userId,
      p_cost: cost,
      p_reason: 'redeem_extra_match',
      p_idempotency_key: idempotencyKey,
    })
    if (redeemErr) {
      // P0001 with 'insufficient_points' = balance too low → 402 Payment Required.
      if (redeemErr.code === 'P0001' || (redeemErr.message ?? '').includes('insufficient_points')) {
        return { _status: 402, _body: { error: 'Insufficient points' } }
      }
      return { _status: 500, _body: { error: redeemErr.message } }
    }

    // redeem_points_for returns -1 on an idempotency replay (same key already
    // charged). Short-circuit so a double-click does NOT bump the quota again or
    // fire a second (free) extra match. A real redemption returns the new balance
    // (>= 0), so a balance landing exactly on 0 is NOT mistaken for a replay.
    if (redeemResult === -1) {
      return {
        _status: 409,
        _body: { message: 'Already redeemed', already: true, target_type: targetType, role_id: roleId, talent_id: talentId },
      }
    }

    // Bump quota counter.
    if (targetType === 'role' && roleId) {
      await db.from('roles')
        .update({ extra_matches_used: used + 1 })
        .eq('id', roleId)
        .eq('extra_matches_used', used) // optimistic concurrency guard
    } else if (targetType === 'talent' && talentId) {
      await db.from('talents')
        .update({ extra_matches_used: used + 1 })
        .eq('id', talentId)
        .eq('extra_matches_used', used)
    }

    // Trigger an extra-match generation. Service-role auth.
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/match-generate`
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify(
        targetType === 'role'
          ? { role_id: roleId, is_extra_match: true }
          : { talent_id: talentId, is_extra_match: true }
      ),
    }).catch(() => { /* best effort */ })

    return {
      _status: 200,
      _body: { message: 'Redeemed', cost, target_type: targetType, role_id: roleId, talent_id: talentId },
    }
  })

  return json(result._body, result._status)
}
