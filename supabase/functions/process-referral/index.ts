/**
 * process-referral
 *
 * Triggered when a referred user completes onboarding (called from
 * AuthCallback). Resolves the referrer from one of two code sources:
 *
 *   1. Per-invite code stored in `referrals.code` (created by the referrer
 *      via the Referrals page with a target email). For these codes, we
 *      verify the new user's email matches `referrals.referred_email` —
 *      otherwise anyone with the link could claim it.
 *
 *   2. Permanent per-profile code stored in `profiles.referral_code`
 *      (DNJ-XXXXXXXX). Open-link sharing — no email check.
 *
 * Awards Diamond Points to both sides via award_points() with idempotency
 * keyed on the referee user id, so replays / double-callbacks are no-ops.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
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

  // Look up referee profile (need email for per-invite verification).
  const { data: referee } = await db.from('profiles')
    .select('id, email').eq('id', refereeId).maybeSingle()
  if (!referee) return json({ error: 'Referee profile not found' }, 404)
  const refereeEmail = (referee.email ?? '').toLowerCase().trim()

  // Try per-invite code first.
  const { data: ref } = await db.from('referrals')
    .select('id, referrer_id, status, referred_email').eq('code', code).maybeSingle()

  let referrerId: string | null = null
  let referralId: string | null = null
  let viaPerInvite = false

  if (ref) {
    // Per-invite code: enforce email match (case-insensitive).
    const targetEmail = (ref.referred_email ?? '').toLowerCase().trim()
    if (targetEmail && targetEmail !== refereeEmail) {
      // Soft-fail: don't 4xx the auth callback, but record nothing.
      return json({
        message: 'Code not valid for this email',
        reason: 'email_mismatch',
        already: false,
      })
    }
    if (ref.status === 'rewarded') return json({ message: 'Already rewarded', already: true })
    referrerId = ref.referrer_id
    referralId = ref.id
    viaPerInvite = true
  } else {
    // Fallback: permanent profile code.
    const { data: referrerProfile } = await db.from('profiles')
      .select('id').eq('referral_code', code).maybeSingle()
    referrerId = referrerProfile?.id ?? null
  }

  if (!referrerId) return json({ error: 'Invalid referral code' }, 404)
  if (referrerId === refereeId) return json({ error: 'Cannot refer yourself' }, 400)

  // Read earn rates.
  const [cfgRef, cfgWelcome] = await Promise.all([
    db.from('system_config').select('value').eq('key', 'points_per_referral').maybeSingle(),
    db.from('system_config').select('value').eq('key', 'points_referee_welcome').maybeSingle(),
  ])
  const referrerPts = typeof cfgRef.data?.value === 'number' ? cfgRef.data.value : 19
  const refereePts  = typeof cfgWelcome.data?.value === 'number' ? cfgWelcome.data.value : 5

  // Idempotency keys: at most one reward per (referee, role) pair, ever.
  const referrerKey = `referral_onboarded:${refereeId}`
  const refereeKey  = `referee_welcome:${referrerId}`

  await db.rpc('award_points', {
    p_user_id: referrerId,
    p_delta: referrerPts,
    p_reason: 'referral_onboarded',
    p_reference: { referral_id: referralId, referred_user_id: refereeId, via: viaPerInvite ? 'per_invite' : 'profile_code' },
    p_idempotency_key: referrerKey,
  })

  await db.rpc('award_points', {
    p_user_id: refereeId,
    p_delta: refereePts,
    p_reason: 'referee_welcome',
    p_reference: { referral_code: code, referrer_id: referrerId, via: viaPerInvite ? 'per_invite' : 'profile_code' },
    p_idempotency_key: refereeKey,
  })

  if (referralId) {
    await db.from('referrals').update({
      referred_user_id: refereeId,
      status: 'rewarded',
      reward_claimed_at: new Date().toISOString(),
    }).eq('id', referralId)
  }

  return json({ message: 'OK', referrer_points: referrerPts, referee_points: refereePts })
})
