import { supabase } from '../../lib/supabase'

// ── referrals reads & writes ──────────────────────────────────────────────────
// A referrer's invite rows + reward state. Hand-queried only from the Referrals
// page (list own referrals, create a new invite). Centralizes those shapes
// behind one seam (mirrors src/data/repositories/matches.ts + profiles.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.order / .select().single()) — behaviour is byte-identical
// to the inlined queries they replace. Each .select projection is passed through
// verbatim from the call site so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/**
 * A referrer's own referrals, newest first (Referrals page list — caller awaits
 * directly).
 */
export function referralsForReferrer(referrerId: string) {
  return supabase
    .from('referrals')
    .select('id, referred_email, code, status, created_at, reward_claimed_at')
    .eq('referrer_id', referrerId)
    .order('created_at', { ascending: false })
}

// ── Writes ────────────────────────────────────────────────────────────────────
/**
 * Create a referral invite, returning the inserted row (Referrals page "create"
 * — caller adds .select().single()).
 */
export function insertReferral(row: Record<string, unknown>) {
  return supabase.from('referrals').insert(row)
}
