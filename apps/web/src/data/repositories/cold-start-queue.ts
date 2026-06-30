import { supabase } from '../../lib/supabase'

// ── Cold-start queue reads & writes ──────────────────────────────────────────
// `match-generate` flags roles whose algorithm found too few candidates onto
// this queue; the admin ColdStartPanel works it down, and the HM dashboard reads
// the pending count for its own roles. Centralizes those queries behind one seam
// (mirrors src/data/repositories/matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.order / .then via await) — behaviour is byte-identical to
// the inlined queries they replace. Each .select projection is passed through
// verbatim from the call site so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/**
 * role_id of every pending queue row across a set of roles (HM dashboard
 * cold-start badge — caller awaits directly).
 */
export function pendingColdStartRoleIds(roleIds: string[]) {
  return supabase
    .from('cold_start_queue')
    .select('role_id')
    .in('role_id', roleIds)
    .eq('status', 'pending')
}

/**
 * Full pending queue with the embedded role for the admin ColdStartPanel
 * (oldest first). Caller awaits directly.
 */
export function pendingColdStartQueue() {
  return supabase
    .from('cold_start_queue')
    .select('id, role_id, status, created_at, roles(id, title, required_traits)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
}

// ── Writes ────────────────────────────────────────────────────────────────────
/** Mark a queue row applied by id (admin applies hand-picked matches). */
export function markColdStartQueueApplied(queueId: string) {
  return supabase.from('cold_start_queue').update({ status: 'applied' }).eq('id', queueId)
}
