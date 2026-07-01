import { supabase } from '../../lib/supabase'

// ── Role mutations ───────────────────────────────────────────────────────────
// First slice of the roles repository (mirrors src/data/repositories/matches.ts).
// Centralizes every WRITE to the `roles` table so status/expiry/edit/insert all
// flow through one seam; page-specific reads stay inline for now. Functions
// return the query builder so callers can chain (.abortSignal).

/** Patch a role by id (status transition, vacancy expiry, edits). */
export function updateRole(roleId: string, patch: Record<string, unknown>) {
  return supabase.from('roles').update(patch).eq('id', roleId)
}

/** Insert a role row (post-role flow / onboarding draft). */
export function insertRole(row: Record<string, unknown>) {
  return supabase.from('roles').insert(row)
}

// ── Role drafts (job_posting_drafts) ─────────────────────────────────────────
// The HM's in-progress role-posting draft — one row per hm_id, the cloud
// counterpart to PostRole's localStorage draft. Builder-return convention.

/** Read the HM's saved cloud draft → { data: { draft_data, updated_at } | null, error }. */
export function getRoleDraft(hmId: string) {
  return supabase.from('job_posting_drafts').select('draft_data, updated_at').eq('hm_id', hmId).maybeSingle()
}

/** Upsert the HM's cloud draft (one row per hm_id). */
export function saveRoleDraft(hmId: string, draftData: unknown) {
  return supabase.from('job_posting_drafts').upsert({ hm_id: hmId, draft_data: draftData }, { onConflict: 'hm_id' })
}

/** Delete the HM's cloud draft (post-submit cleanup / discard). */
export function deleteRoleDraft(hmId: string) {
  return supabase.from('job_posting_drafts').delete().eq('hm_id', hmId)
}
