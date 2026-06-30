import { supabase } from '../../lib/supabase'

// ── Job-posting draft reads & writes ──────────────────────────────────────────
// `job_posting_drafts` is the cloud autosave behind the PostRole form: one row
// per HM holding the in-progress role draft. Loaded on mount, upserted on
// autosave, and deleted once the role is submitted or the draft is discarded.
// Centralizing here mirrors src/data/repositories/matches.ts.
//
// Functions return the query BUILDER (not awaited) so the call site keeps its own
// terminal operators (.maybeSingle / .then). The .select projection is copied
// verbatim so the PostgREST column list cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/** The HM's saved draft, if any (restore banner — caller adds .maybeSingle().then()). */
export function jobPostingDraftByHmId(hmId: string) {
  return supabase
    .from('job_posting_drafts')
    .select('draft_data, updated_at')
    .eq('hm_id', hmId)
}

// ── Writes ────────────────────────────────────────────────────────────────────
/**
 * Upsert the HM's draft keyed by hm_id (PostRole cloud autosave). Caller passes
 * the conflict target, e.g. { onConflict: 'hm_id' }.
 */
export function upsertJobPostingDraft(
  row: Record<string, unknown>,
  options?: { onConflict?: string },
) {
  return supabase.from('job_posting_drafts').upsert(row, options)
}

/** Delete the HM's draft (after submit / on discard). */
export function deleteJobPostingDraftByHmId(hmId: string) {
  return supabase.from('job_posting_drafts').delete().eq('hm_id', hmId)
}
