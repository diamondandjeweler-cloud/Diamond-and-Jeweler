/**
 * process-referral
 *
 * Triggered when a referred user completes onboarding.
 * - Referrer gets points_per_referral (default 19) Diamond Points.
 * - Referee (new user) gets points_referee_welcome (default 5) Diamond Points.
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
  const refereeId = body.referred_user_id ?? auth.userId
  if (!code || !refereeId) return json({ error: 'Missing referral_code or referred_user_id' }, 400)

  const db = adminClient()

  // Look up the referral row.
  const { data: ref } = await db.from('referrals')
    .select('id, referrer_id, status').eq('code', code).maybeSingle()

  // Also support codes stored directly on profiles.referral_code.
  let referrerId: string | null = ref?.referrer_id ?? null
  let referralId: string | null = ref?.id ?? null
  const alreadyRewarded = ref?.status === 'rewarded'

  if (!referrerId) {
    // Look up profile by referral_code column (permanent code flow).
    const { data: referrerProfile } = await db.from('profiles')
      .select('id').eq('referral_code', code).maybeSingle()
    referrerId = referrerProfile?.id ?? null
  }

  if (!referrerId) return json({ error: 'Invalid referral code' }, 404)
  if (referrerId === refereeId) return json({ error: 'Cannot refer yourself' }, 400)
  if (alreadyRewarded) return json({ message: 'Already rewarded', already: true })

  // Read earn rates.
  const [cfgRef, cfgWelcome] = await Promise.all([
    db.from('system_config').select('value').eq('key', 'points_per_referral').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'points_referee_welcome').maybeSingle(),
  ])
  const referrerPts = typeof cfgRef.data?.value === 'number' ? cfgRef.data.value : 19
  const refereePts  = typeof cfgWelcome.data?.value === 'number' ? cfgWelcome.data.value : 5

  // Award referrer.
  await db.rpc('award_points', {
    p_user_id: referrerId,
    p_delta: referrerPts,
    p_reason: 'referral_onboarded',
    p_reference: { referral_id: referralId, referred_user_id: refereeId },
  })

  // Award referee welcome bonus.
  await db.rpc('award_points', {
    p_user_id: refereeId,
    p_delta: refereePts,
    p_reason: 'referee_welcome',
    p_reference: { referral_code: code, referrer_id: referrerId },
  })

  // Mark referral row as rewarded if it exists.
  if (referralId) {
    await db.from('referrals').update({
      referred_user_id: refereeId,
      status: 'rewarded',
      reward_claimed_at: new Date().toISOString(),
    }).eq('id', referralId)
  }

  return json({ message: 'OK', referrer_points: referrerPts, referee_points: refereePts })
})
