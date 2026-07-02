import { supabase } from '../../lib/supabase'

// ── Referrals ────────────────────────────────────────────────────────────────
// Centralizes the referrals table and the generate_referral_code RPC. Mirrors
// systemConfig.ts / points.ts — every function returns the query BUILDER so
// callers keep their own terminal operators (await / .then(r => r) for
// Promise.race promotion), and each .select projection is passed through
// verbatim from the original call site.

/** Referrals sent by a user, newest first (Referrals page list). */
export function referralsForReferrer(userId: string) {
  return supabase
    .from('referrals')
    .select('id, referred_email, code, status, created_at, reward_claimed_at')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false })
}

/** RPC: mint a unique referral code server-side → { data: string | null, error }. */
export function generateReferralCode() {
  return supabase.rpc('generate_referral_code')
}

/** Insert one referral row and return it (unprojected .select().single() preserved). */
export function createReferral(row: { referrer_id: string; referred_email: string; code: string }) {
  return supabase.from('referrals').insert(row).select().single()
}
