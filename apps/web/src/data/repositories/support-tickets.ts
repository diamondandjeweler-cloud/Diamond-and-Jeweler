import { supabase } from '../../lib/supabase'

// ── Support ticket reads & writes ────────────────────────────────────────────
// `support_tickets` backs the user-facing SupportForm, the admin SupportPanel
// triage queue, and the AI-chat "flag for human" action. This centralizes those
// queries behind one seam (mirrors src/data/repositories/matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.eq / .limit / .then) — behaviour is byte-identical to the
// inlined queries they replace. Each .select projection is passed through
// verbatim from the call site so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/**
 * Admin triage list (SupportPanel) — ordered. The caller still chains the
 * status filter (.eq('status', …)) and .limit(100), so the per-tab behaviour is
 * unchanged.
 */
export function adminSupportTicketList() {
  return supabase
    .from('support_tickets')
    .select('id, user_id, category, payment_sub_type, summary, transcript, status, admin_notes, payment_transaction_id, payment_amount, payment_status_snapshot, created_at, resolved_at')
    .order('created_at', { ascending: false })
}

/**
 * Head count of a user's still-open tickets (SupportForm badge) — caller adds
 * .then(({ count }) => …).
 */
export function openTicketCountForUser(userId: string) {
  return supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['open', 'in_progress'])
}

// ── Writes ────────────────────────────────────────────────────────────────────
/** Insert a support ticket (SupportForm submit / AIChatPanel flag-for-human). */
export function insertSupportTicket(row: Record<string, unknown>) {
  return supabase.from('support_tickets').insert(row)
}

/** Patch a support ticket by id (status transitions / admin notes — SupportPanel). */
export function updateSupportTicket(ticketId: string, patch: Record<string, unknown>) {
  return supabase.from('support_tickets').update(patch).eq('id', ticketId)
}
