import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type SupportTicketInsert = Database['public']['Tables']['support_tickets']['Insert']
type SupportTicketUpdate = Database['public']['Tables']['support_tickets']['Update']

// ── support_tickets: user support requests + admin triage ─────────────────────
// Centralizes reads/writes of the support_tickets table. Mirrors systemConfig.ts
// / points.ts — every function returns the query BUILDER, so callers keep their
// own terminal operator (.then / await / chained .eq/.limit) and each .select
// projection is passed through verbatim from the original call site.

/** Head-count of a user's open/in-progress tickets → thenable resolving { count }. */
export function countOpenTicketsForUser(userId: string) {
  return supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['open', 'in_progress'])
}

/** Base builder for the admin ticket list (newest first); caller chains optional .eq('status', …) and terminal .limit. */
export function ticketListBase() {
  return supabase
    .from('support_tickets')
    .select('id, user_id, category, payment_sub_type, summary, transcript, status, admin_notes, payment_transaction_id, payment_amount, payment_status_snapshot, created_at, resolved_at')
    .order('created_at', { ascending: false })
}

/** Insert one fully-built ticket row (payload constructed verbatim at the call site) → { error }. */
export function insertTicket(row: SupportTicketInsert) {
  return supabase.from('support_tickets').insert(row)
}

/** Patch one ticket by id (status/resolved_at/admin_notes) → { error }. */
export function updateTicket(id: string, patch: SupportTicketUpdate) {
  return supabase.from('support_tickets').update(patch).eq('id', id)
}
