import { supabase } from '../../lib/supabase'

// ── Interview mutations ──────────────────────────────────────────────────────
// Completes write-centralization across the recruitment-core tables (matches,
// roles, interviews). Reads of interview_rounds / interview_proposals stay
// page-specific because the HM and talent projections legitimately differ (the
// HM sees hm_notes / decline_reason; the talent does not).

/** Patch an interview row by id (e.g. mark completed). */
export function updateInterview(interviewId: string, patch: Record<string, unknown>) {
  return supabase.from('interviews').update(patch).eq('id', interviewId)
}

/** Insert an interview row (HR schedules an interview). */
export function insertInterview(row: Record<string, unknown>) {
  return supabase.from('interviews').insert(row)
}
