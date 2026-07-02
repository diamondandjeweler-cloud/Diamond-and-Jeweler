import { supabase } from '../../lib/supabase'

// ── data_requests: PDPA data subject requests (DSR) ──────────────────────────
// Centralizes reads/writes of the data_requests table for the admin DSR panel
// and the user-facing /data-requests page. Mirrors systemConfig.ts / points.ts
// — every function returns the query BUILDER so callers keep their own
// terminal operators (.limit / .single / await), and each .select projection
// is passed through verbatim from the original call site.

/** Base builder for the admin DSR panel (full projection + requester profile, newest first); caller chains the optional status filter and terminal .limit. */
export function adminDataRequestsBase() {
  return supabase
    .from('data_requests')
    .select('id, user_id, request_type, status, notes, correction_proposal, created_at, resolved_at, profiles!data_requests_user_id_fkey(email, full_name)')
    .order('created_at', { ascending: false })
}

/** Patch one data request's status fields by id → { error }. */
export function updateDataRequest(id: string, patch: Record<string, unknown>) {
  return supabase.from('data_requests').update(patch).eq('id', id)
}

/** The current user's own DSR history, newest first (RLS-scoped — intentionally no user_id filter). Caller keeps its own await. */
export function listOwnDataRequests() {
  return supabase
    .from('data_requests')
    .select('id, request_type, status, notes, correction_proposal, resolved_at, created_at')
    .order('created_at', { ascending: false })
}

/** Insert a new data request, returning the created row (`.select().single()`). */
export function createDataRequest(row: {
  user_id: string
  request_type: string
  notes: string | null
  correction_proposal: unknown
}) {
  return supabase.from('data_requests').insert(row).select().single()
}
