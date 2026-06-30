import { supabase } from '../../lib/supabase'

// ── Profile reads & writes ───────────────────────────────────────────────────
// `profiles` is the most hand-queried table in the app: every dashboard, the
// admin panels, both onboarding flows and the session bootstrap touch it. This
// centralizes those queries behind one seam (mirrors src/data/repositories/
// matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.maybeSingle / .single / .then / .order / .or) — behaviour
// is byte-identical to the inlined queries they replace. Each .select projection
// is passed through verbatim from the call site so PostgREST column lists cannot
// drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/** Full profile row by id (session bootstrap — caller adds .maybeSingle()). */
export function profileById(userId: string) {
  return supabase.from('profiles').select('*').eq('id', userId)
}

/** Profile role only, by id (auth-callback never-downgrade guard — caller adds .single()). */
export function profileRoleById(userId: string) {
  return supabase.from('profiles').select('role').eq('id', userId)
}

/** Profile point balance by id (dashboard wallet badge — caller adds .maybeSingle()). */
export function profilePointsById(userId: string) {
  return supabase.from('profiles').select('points').eq('id', userId)
}

/** Profile consents JSON by id (DOB consent merge — caller adds .maybeSingle()). */
export function profileConsentsById(userId: string) {
  return supabase.from('profiles').select('consents').eq('id', userId)
}

/** Profile email by id (HM onboarding company-by-email lookup — caller adds .maybeSingle()). */
export function profileEmailById(userId: string) {
  return supabase.from('profiles').select('email').eq('id', userId)
}

/** Saved onboarding draft fields by id (talent onboarding resume — caller adds .maybeSingle()). */
export function profileOnboardingDraftById(userId: string) {
  return supabase.from('profiles').select('interview_transcript, full_name, phone').eq('id', userId)
}

/** Identity tuples for a set of user ids (admin panels — caller awaits directly). */
export function profilesByIds(userIds: string[]) {
  return supabase.from('profiles').select('id, email, full_name').in('id', userIds)
}

/**
 * Admin user-list base query (UserPanel) — ordered + limited. The caller still
 * chains the filter clauses (.eq/.gte/.or) so search/segment behaviour is
 * unchanged.
 */
export function adminUserList() {
  return supabase
    .from('profiles')
    .select('id, email, full_name, role, is_banned, onboarding_complete, ghost_score, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
}

// ── Writes ────────────────────────────────────────────────────────────────────
/** Patch a profile by id (generic update — onboarding, settings, account edits). */
export function updateProfile(userId: string, patch: Record<string, unknown>) {
  return supabase.from('profiles').update(patch).eq('id', userId)
}
