import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

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
/**
 * Session profile by id (session bootstrap — caller adds .maybeSingle()).
 *
 * Explicit projection of exactly the columns the shared `Profile` type
 * (src/types/db.ts) exposes to session/profile consumers. Deliberately EXCLUDES
 * the heavy `interview_transcript` blob (onboarding-resume reads it via its own
 * narrow `profileOnboardingDraftById`) and internal-only columns never rendered
 * from the session object (consent_ip_hash, deleted_at, diamond_points,
 * email_bounced, onboarding_reminder_count, onboarding_reminder_sent_at), so a
 * cold hydrate no longer pulls the transcript on every bootstrap. Keep this list
 * in sync with the `Profile` interface.
 */
export function profileById(userId: string) {
  return supabase
    .from('profiles')
    .select(
      'id, email, full_name, display_name, phone, role, consents, is_banned, ghost_score, onboarding_complete, waitlist_approved, created_at, updated_at, consent_version, consent_signed_at, locale, whatsapp_number, whatsapp_opt_in, points, points_earned_total, referral_code',
    )
    .eq('id', userId)
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
  // No .returns<>() here: callers (UserPanel) chain .eq/.gte/.or filter clauses
  // after this builder, which .returns() (a transform builder) does not expose.
}

// ── Writes ────────────────────────────────────────────────────────────────────
/** Patch a profile by id (generic update — onboarding, settings, account edits). */
export function updateProfile(userId: string, patch: ProfileUpdate) {
  return supabase.from('profiles').update(patch).eq('id', userId)
}

// ── RPCs ──────────────────────────────────────────────────────────────────────
/** RPC: encrypt a DOB via encrypt_dob(text) → bytea (write-side counterpart of decrypt_dob; caller awaits). */
export function encryptDobRpc(dobIsoDate: string) {
  return supabase.rpc('encrypt_dob', { dob_text: dobIsoDate })
}
