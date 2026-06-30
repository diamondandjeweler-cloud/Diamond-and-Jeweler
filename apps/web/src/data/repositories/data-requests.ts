import { supabase } from '../../lib/supabase'

// ── Data-subject request (DSR) reads & writes ────────────────────────────────
// `data_requests` backs the user-facing DataRequests page (a person's own
// access/erasure/correction history + new submissions) and the admin DsrPanel
// fulfilment queue. This centralizes those queries behind one seam (mirrors
// src/data/repositories/matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.in / .limit / .select / .single) — behaviour is
// byte-identical to the inlined queries they replace. Each .select projection is
// passed through verbatim from the call site so PostgREST column lists cannot
// drift. The two reads use DIFFERENT projections (the admin one embeds the
// requester profile), so they are kept as separate functions.

// ── Reads ─────────────────────────────────────────────────────────────────────
/**
 * A user's own DSR history (DataRequests page) — RLS scopes it to the caller.
 * Ordered newest-first; the call site awaits this directly inside Promise.all.
 */
export function ownDataRequests() {
  return supabase
    .from('data_requests')
    .select('id, request_type, status, notes, correction_proposal, resolved_at, created_at')
    .order('created_at', { ascending: false })
}

/**
 * Admin DSR fulfilment list (DsrPanel) with the requester profile embedded —
 * ordered. The caller still chains the status filter (.in('status', …)) and
 * .limit(100), so the per-tab behaviour is unchanged.
 */
export function adminDataRequestList() {
  return supabase
    .from('data_requests')
    .select('id, user_id, request_type, status, notes, correction_proposal, created_at, resolved_at, profiles!data_requests_user_id_fkey(email, full_name)')
    .order('created_at', { ascending: false })
}

// ── Writes ────────────────────────────────────────────────────────────────────
/**
 * Insert a new DSR (DataRequests submit). Returns the insert builder so the
 * caller keeps its .select().single() to read the created row back.
 */
export function insertDataRequest(row: Record<string, unknown>) {
  return supabase.from('data_requests').insert(row)
}

/** Patch a DSR by id (status transitions / fulfilment — DsrPanel). */
export function updateDataRequest(requestId: string, patch: Record<string, unknown>) {
  return supabase.from('data_requests').update(patch).eq('id', requestId)
}
