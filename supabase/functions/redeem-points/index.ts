/**
 * redeem-points
 *
 * Trades N points (default 5) for one free extra-match slot on a role.
 * Caller must own the role (HM) or be admin.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface Body { role_id?: string }

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['hiring_manager', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* tolerate */ }
  if (!body.role_id) return json({ error: 'Missing role_id' }, 400)

  const db = adminClient()

  const { data: cfg } = await db.from('system_config').select('value')
    .eq('key', 'points_per_extra_match').maybeSingle()
  const cost = typeof cfg?.value === 'number' ? cfg.value : 5

  const { data: prof } = await db.from('profiles').select('points').eq('id', auth.userId).maybeSingle()
  if (!prof || (prof.points ?? 0) < cost) {
    return json({ error: `Need ${cost} points; you have ${prof?.points ?? 0}` }, 400)
  }

  // Verify role ownership unless admin
  if (auth.role !== 'admin') {
    const { data: role } = await db.from('roles')
      .select('id, hiring_manager_id, hiring_managers!inner(profile_id)')
      .eq('id', body.role_id).maybeSingle()
    const ok = (role as unknown as { hiring_managers?: { profile_id: string } })?.hiring_managers?.profile_id === auth.userId
    if (!ok) return json({ error: 'Not the role owner' }, 403)
  }

  // Deduct points + log
  await db.rpc('award_points', {
    p_user_id: auth.userId,
    p_delta: -cost,
    p_reason: 'redeem_extra_match',
    p_reference: { role_id: body.role_id },
  })

  // Trigger an extra-match generation. Reuse match-generate with is_extra_match=true.
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/match-generate`
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
    body: JSON.stringify({ role_id: body.role_id, is_extra_match: true }),
  })

  return json({ message: 'Redeemed', cost })
})
