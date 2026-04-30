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

interface Body {
  target_type?: 'role' | 'talent'
  role_id?: string
  talent_id?: string
  /** Legacy: original API only accepted role_id (HM-only). */
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

  // Backward-compat: if only role_id is supplied, treat as HM redemption.
  let targetType = body.target_type
  if (!targetType) targetType = body.role_id ? 'role' : 'talent'

  const db = adminClient()

  // Cost.
  const { data: costCfg } = await db.from('system_config').select('value')
    .eq('key', 'points_per_extra_match').maybeSingle()
  const cost = typeof costCfg?.value === 'number' ? costCfg.value : 21

  // Balance.
  const { data: prof } = await db.from('profiles').select('points').eq('id', auth.userId).maybeSingle()
  const balance = prof?.points ?? 0
  if (balance < cost) {
    return json({ error: `Need ${cost} points; you have ${balance}`, balance, cost }, 400)
  }

  // Resolve target + verify ownership + read current quota.
  let roleId: string | null = null
  let talentId: string | null = null
  let used = 0
  let cap = 3

  if (targetType === 'role') {
    if (!body.role_id) return json({ error: 'role_id required' }, 400)
    if (auth.role === 'talent') return json({ error: 'Talents cannot redeem on a role' }, 403)

    const { data: role } = await db.from('roles')
      .select('id, hiring_manager_id, extra_matches_used, status')
      .eq('id', body.role_id).maybeSingle()
    if (!role) return json({ error: 'Role not found' }, 404)
    if (role.status !== 'active') return json({ error: `Role is ${role.status}` }, 400)

    if (auth.role !== 'admin') {
      const { data: hm } = await db.from('hiring_managers')
        .select('id').eq('id', role.hiring_manager_id).eq('profile_id', auth.userId)
        .maybeSingle()
      if (!hm) return json({ error: 'Not the role owner' }, 403)
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
    if (!tid) return json({ error: 'Talent profile not found' }, 404)

    const { data: talent } = await db.from('talents')
      .select('id, profile_id, extra_matches_used').eq('id', tid).maybeSingle()
    if (!talent) return json({ error: 'Talent not found' }, 404)
    if (auth.role === 'talent' && talent.profile_id !== auth.userId) {
      return json({ error: 'Cannot redeem for another talent' }, 403)
    }
    if (auth.role === 'hiring_manager') {
      return json({ error: 'Hiring managers redeem against a role, not a talent' }, 403)
    }
    talentId = talent.id
    used = talent.extra_matches_used ?? 0

    const { data: capCfg } = await db.from('system_config').select('value')
      .eq('key', 'extra_match_cap_per_talent').maybeSingle()
    if (typeof capCfg?.value === 'number') cap = capCfg.value
  }

  if (used >= cap) {
    return json({ error: 'Extra match quota exhausted', used, cap }, 400)
  }

  // Deduct points with an idempotency key derived from the current `used` value.
  // A double-click from the UI sees the same key and is rejected as already-spent.
  const idempotencyKey = `redeem:${targetType}:${roleId ?? talentId}:${used}`

  const { data: awarded, error: awardErr } = await db.rpc('award_points', {
    p_user_id: auth.userId,
    p_delta: -cost,
    p_reason: 'redeem_extra_match',
    p_reference: { target_type: targetType, role_id: roleId, talent_id: talentId, used_before: used },
    p_idempotency_key: idempotencyKey,
  })
  if (awardErr) return json({ error: awardErr.message }, 500)
  if (awarded === 0) {
    return json({ error: 'Already redeemed for this slot — refresh and try again', already: true }, 409)
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

  return json({ message: 'Redeemed', cost, target_type: targetType, role_id: roleId, talent_id: talentId })
})
