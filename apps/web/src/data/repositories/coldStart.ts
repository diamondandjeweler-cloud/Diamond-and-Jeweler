import { supabase } from '../../lib/supabase'

// ── cold_start_queue: manual-seeding queue for under-matched roles ────────────
// Same builder-returning convention as matches.ts / systemConfig.ts: every
// function returns the query BUILDER so call sites keep their own await /
// Promise.all placement, and each projection/filter chain is verbatim from
// the call site it replaces.

/** Pending cold-start queue rows with their role embed, oldest first (admin panel). */
export function pendingColdStartQueue() {
  return supabase
    .from('cold_start_queue')
    .select('id, role_id, status, created_at, roles(id, title, required_traits)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
}

/** role_id of pending queue rows within a set of roles (HM dashboard flag). */
export function pendingColdStartRoleIds(roleIds: string[]) {
  return supabase.from('cold_start_queue').select('role_id')
    .in('role_id', roleIds).eq('status', 'pending')
}

/** Mark a queue row applied after manual matches are inserted. */
export function markColdStartApplied(queueId: string) {
  return supabase.from('cold_start_queue').update({ status: 'applied' }).eq('id', queueId)
}
