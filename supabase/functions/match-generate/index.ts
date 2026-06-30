/**
 * match-generate — HTTP wrapper
 *
 * All matching logic lives in _shared/match-core.ts (matchForRole).
 * This file is just the HTTP entry point; the batch queue worker
 * (process-match-queue) imports matchForRole directly from match-core,
 * so there is zero code duplication between the two call paths.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { enforceRateLimit, RateLimitError } from '../_shared/ratelimit.ts'
import { matchForRole, MatchError } from '../_shared/match-core.ts'
import { reportError } from '../_shared/observe.ts'

interface Body { role_id?: string; is_extra_match?: boolean }

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
      if (e instanceof RateLimitError) return json({ error: 'rate_limited' }, 429)
      throw e
    }
  }

  try {
    const result = await matchForRole({
      roleId:       body.role_id,
      isExtraMatch: body.is_extra_match === true,
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
})
