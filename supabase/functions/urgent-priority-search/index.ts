/**
 * urgent-priority-search
 *
 * Spend Diamond Points (default 9) to receive ONE top-ranked result on the spot.
 *
 * Body:
 *   { request_type: 'find_worker', role_id:   uuid }   — HM finds 1 candidate for a role
 *   { request_type: 'find_job'                   }      — Talent finds 1 open role for themself
 *
 * Flow:
 *   1. authenticate caller (talent or hiring_manager)
 *   2. ownership / role-status checks
 *   3. (find_worker only) PRE-FLIGHT: can_run_urgent_match_for_role RPC.
 *      If matchForRole would refuse to run (refresh limit hit, expired,
 *      etc.), bail BEFORE charging. — fixes BUG 4.
 *   4. charge_urgent_priority RPC — atomic, row-locked balance check
 *      + deduct + audit row. — race-safe per BUG 2 fix in 0077.
 *   5. run the search synchronously (urgent = caller waits for result)
 *      - find_worker: snap timestamp → matchForRole(isExtraMatch=true)
 *                     → look up matches for THIS role created after the
 *                       cutoff (avoids tagging a concurrent insert) → flag
 *                       is_urgent + force status='generated' so the HM sees
 *                       it immediately even when approval_mode='manual'.
 *                       — fixes BUG 1 + BUG 3.
 *      - find_job:    get_urgent_jobs_for_talent RPC → returns 1 role id.
 *   6. mark_urgent_request_completed RPC writes terminal state + result_id
 *      so the talent dashboard can rehydrate the result on reload (BUG 5).
 *
 * Daily cap is enforced inside charge_urgent_priority (default 5/24h).
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { matchForRole, MatchError } from '../_shared/match-core.ts'

interface Body {
  request_type?: 'find_worker' | 'find_job'
  role_id?: string
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['talent', 'hiring_manager', 'admin'],
  })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* tolerate */ }

  const requestType = body.request_type
  if (requestType !== 'find_worker' && requestType !== 'find_job') {
    return json({ error: 'request_type must be find_worker or find_job' }, 400)
  }
  if (requestType === 'find_worker' && auth.role === 'talent') {
    return json({ error: 'Only hiring managers can search for workers' }, 403)
  }
  if (requestType === 'find_job' && auth.role === 'hiring_manager') {
    return json({ error: 'Only talents can search for jobs' }, 403)
  }

  const db = adminClient()

  // ── Pre-flight: ownership + target validation ─────────────────────────────
  let roleId: string | null = null
  let talentId: string | null = null

  if (requestType === 'find_worker') {
    if (!body.role_id) return json({ error: 'role_id required for find_worker' }, 400)
    const { data: role } = await db.from('roles')
      .select('id, hiring_manager_id, status, vacancy_expires_at')
      .eq('id', body.role_id).maybeSingle()
    if (!role) return json({ error: 'Role not found' }, 404)
    if (role.status !== 'active') return json({ error: `Role is ${role.status}` }, 400)
    const expiry = (role as { vacancy_expires_at: string | null }).vacancy_expires_at
    if (expiry && new Date(expiry) < new Date()) {
      return json({ error: 'Role vacancy has expired' }, 400)
    }
    if (auth.role === 'hiring_manager') {
      const { data: hm } = await db.from('hiring_managers')
        .select('id').eq('id', role.hiring_manager_id).eq('profile_id', auth.userId)
        .maybeSingle()
      if (!hm) return json({ error: 'Not the role owner' }, 403)
    }
    roleId = role.id

    // BUG 4 fix — refuse to charge if matchForRole would no-op anyway.
    const { data: gateRows, error: gateErr } = await db.rpc('can_run_urgent_match_for_role', {
      p_role_id: roleId,
    })
    if (gateErr) return json({ error: `Pre-flight check failed: ${gateErr.message}` }, 500)
    const gate = Array.isArray(gateRows) ? gateRows[0] : gateRows
    if (gate && gate.ok === false) {
      return json({ error: gate.reason ?? 'Urgent search not available for this role' }, 400)
    }
  } else {
    const { data: t } = await db.from('talents').select('id, is_open_to_offers, profile_expires_at')
      .eq('profile_id', auth.userId).maybeSingle()
    if (!t) return json({ error: 'Talent profile not found' }, 404)
    if (!t.is_open_to_offers) return json({ error: 'Open your profile to offers first' }, 400)
    talentId = t.id
  }

  // ── Atomic charge: balance check + ledger insert + request row ────────────
  const context = requestType === 'find_worker'
    ? { role_id: roleId }
    : { talent_id: talentId }

  const { data: chargeRows, error: chargeErr } = await db.rpc('charge_urgent_priority', {
    p_user_id:      auth.userId,
    p_request_type: requestType,
    p_context:      context,
  })
  if (chargeErr) {
    // P0001 = our raised exception (insufficient points / cap reached)
    return json({ error: chargeErr.message }, chargeErr.code === 'P0001' ? 400 : 500)
  }
  const charged = Array.isArray(chargeRows) ? chargeRows[0] : chargeRows
  const requestId: string = charged?.request_id
  const cost: number      = charged?.cost ?? 9
  const balanceAfter: number = charged?.balance_after ?? 0
  if (!requestId) return json({ error: 'Charge failed — no request_id' }, 500)

  // ── Run the search synchronously ──────────────────────────────────────────
  try {
    if (requestType === 'find_worker') {
      // BUG 3 fix: snap a cutoff *before* matchForRole runs. We later look
      // up the match created on or after this cutoff for THIS role, so a
      // concurrent insert by process-match-queue (or any other path) cannot
      // be misattributed as our urgent result.
      // 100 ms safety margin compensates for clock skew between DB and the
      // Edge Function host.
      const cutoffIso = new Date(Date.now() - 100).toISOString()

      // Reuse matchForRole — isExtraMatch=true returns exactly 1 candidate.
      // Service-role context bypasses ownership check inside match-core.
      const result = await matchForRole({
        roleId:        roleId!,
        isExtraMatch:  true,
        isServiceRole: true,
      })

      if ((result.matches_added ?? 0) === 0) {
        await db.rpc('mark_urgent_request_completed', {
          p_request_id:  requestId,
          p_status:      'no_result',
          p_result_kind: null,
          p_result_id:   null,
          p_error:       result.message ?? 'No matching candidate found',
        })
        return json({
          success: true,
          request_id: requestId,
          cost,
          balance_after: balanceAfter,
          result: null,
          message: result.message ?? 'No matching candidate found right now — points were still consumed for the urgent search.',
        })
      }

      // BUG 3 fix: pick the match created at/after cutoff for this role.
      // BUG 1 fix: force is_urgent=true AND status='generated' so the HM
      // sees the match immediately, even when match_approval_mode='manual'.
      // Urgent matches bypass the admin approval queue by design — that's
      // the entire value proposition of paying 9 points.
      const { data: ours } = await db.from('matches')
        .select('id, talent_id, compatibility_score, status')
        .eq('role_id', roleId!)
        .gte('created_at', cutoffIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let flagged: { id: string; talent_id: string; compatibility_score: number | null } | null = null
      if (ours) {
        const newStatus = ours.status === 'pending_approval' ? 'generated' : ours.status
        await db.from('matches')
          .update({ is_urgent: true, status: newStatus })
          .eq('id', ours.id)
        flagged = {
          id: ours.id,
          talent_id: ours.talent_id,
          compatibility_score: ours.compatibility_score,
        }
      }

      await db.rpc('mark_urgent_request_completed', {
        p_request_id:  requestId,
        p_status:      'completed',
        p_result_kind: 'match',
        p_result_id:   flagged?.id ?? null,
        p_error:       null,
      })

      return json({
        success: true,
        request_id: requestId,
        cost,
        balance_after: balanceAfter,
        result: flagged
          ? { kind: 'match', match_id: flagged.id, talent_id: flagged.talent_id, compatibility_score: flagged.compatibility_score }
          : null,
        message: 'Urgent candidate ready.',
      })
    }

    // find_job — Talent side.
    const { data: roleRows, error: jobErr } = await db.rpc('get_urgent_jobs_for_talent', {
      p_talent_id: talentId!,
      p_limit:     1,
    })
    if (jobErr) throw new Error(jobErr.message)
    const topRoleId = (roleRows as { role_id: string }[] | null)?.[0]?.role_id ?? null

    if (!topRoleId) {
      await db.rpc('mark_urgent_request_completed', {
        p_request_id:  requestId,
        p_status:      'no_result',
        p_result_kind: null,
        p_result_id:   null,
        p_error:       'No matching open role',
      })
      return json({
        success: true,
        request_id: requestId,
        cost,
        balance_after: balanceAfter,
        result: null,
        message: 'No matching open role right now — points were still consumed for the urgent search.',
      })
    }

    const { data: role } = await db.from('roles')
      .select('id, title, description, salary_min, salary_max, location, work_arrangement, employment_type, hourly_rate, duration_days')
      .eq('id', topRoleId).maybeSingle()

    await db.rpc('mark_urgent_request_completed', {
      p_request_id:  requestId,
      p_status:      'completed',
      p_result_kind: 'role',
      p_result_id:   topRoleId,
      p_error:       null,
    })

    return json({
      success: true,
      request_id: requestId,
      cost,
      balance_after: balanceAfter,
      result: { kind: 'role', role },
      message: 'Urgent job match ready.',
    })
  } catch (err) {
    const msg = err instanceof MatchError ? err.message
      : err instanceof Error ? err.message
      : String(err)
    await db.rpc('mark_urgent_request_completed', {
      p_request_id:  requestId,
      p_status:      'failed',
      p_result_kind: null,
      p_result_id:   null,
      p_error:       msg,
    })
    return json({ error: msg, request_id: requestId, cost, balance_after: balanceAfter }, 500)
  }
})
