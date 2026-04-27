/**
 * process-referral
 *
 * Triggered when a referred user completes onboarding. Marks the referral
 * as `rewarded` and grants points to the referrer.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface Body { referral_code?: string; referred_user_id?: string }

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['talent', 'hiring_manager', 'hr_admin', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* tolerate */ }
  const code = body.referral_code?.trim().toUpperCase()
  const userId = body.referred_user_id ?? auth.userId
  if (!code || !userId) return json({ error: 'Missing referral_code or referred_user_id' }, 400)

  const db = adminClient()

  const { data: ref } = await db.from('referrals')
    .select('id, referrer_id, status').eq('code', code).maybeSingle()
  if (!ref) return json({ error: 'Invalid referral code' }, 404)
  if (ref.status === 'rewarded') return json({ message: 'Already rewarded', already: true })

  // Reward the referrer with points
  const { data: cfg } = await db.from('system_config').select('value')
    .eq('key', 'points_per_referral').maybeSingle()
  const pts = typeof cfg?.value === 'number' ? cfg.value : 3

  await db.rpc('award_points', {
    p_user_id: ref.referrer_id,
    p_delta: pts,
    p_reason: 'referral_onboarded',
    p_reference: { referral_id: ref.id, referred_user_id: userId },
  })

  await db.from('referrals').update({
    referred_user_id: userId,
    status: 'rewarded',
    reward_claimed_at: new Date().toISOString(),
  }).eq('id', ref.id)

  return json({ message: 'OK', points_awarded: pts })
})
