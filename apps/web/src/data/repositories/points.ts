import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../types/db.generated'

type PointTransactionRow = Database['public']['Tables']['point_transactions']['Row']

// ── Points / purchases reads ─────────────────────────────────────────────────
// Centralizes the Diamond-Points money tables: the point_transactions ledger and
// the two purchase tables polled after a Billplz redirect (point_purchases for
// top-ups, extra_match_purchases for one-off match buys). Mirrors src/data/
// repositories/matches.ts — functions return the query BUILDER so callers keep
// their own terminal operators (.maybeSingle / .then), and every .select
// projection is passed through verbatim from the call site.

/** Table the payment-return poller reads, keyed by purchase kind. */
export type PurchaseTable = 'point_purchases' | 'extra_match_purchases'

/** Points ledger for a user, newest first, capped at 50 (PointsWallet). */
export function pointTransactionsForUser(userId: string) {
  return supabase
    .from('point_transactions')
    .select('id, delta, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<Pick<PointTransactionRow, 'id' | 'delta' | 'reason' | 'created_at'>[]>()
}

/**
 * Payment status of a purchase row by id (PaymentReturn poller). `table` selects
 * the points top-up vs. extra-match purchase table — same projection/filter for
 * both. Caller adds .maybeSingle().
 */
export function purchasePaymentStatusById(table: PurchaseTable, purchaseId: string) {
  // Both purchase tables share `payment_status: string`; project it explicitly so
  // callers get a typed field without depending on which table was passed.
  return supabase
    .from(table)
    .select('payment_status')
    .eq('id', purchaseId)
    .returns<{ payment_status: string }[]>()
}

/** RPC: award points (server-side ledger write, deduped by p_idempotency_key); callers treat as best-effort. */
export function awardPoints(params: {
  p_user_id: string
  p_delta: number
  p_reason: string
  p_reference: Json
  p_idempotency_key: string
}) {
  return supabase.rpc('award_points', params)
}
