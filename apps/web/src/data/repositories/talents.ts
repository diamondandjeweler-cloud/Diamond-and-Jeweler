import { supabase } from '../../lib/supabase'

// ── Talent reads & writes ─────────────────────────────────────────────────────
// `talents` is the identity + matching-profile row behind every talent surface:
// onboarding upsert, the talent dashboard bootstrap, profile editing, growth-nudge
// prefs, the admin cold-start pool and the dev-seed panel all hand-query it. This
// centralizes those queries behind one seam (mirrors src/data/repositories/
// matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.maybeSingle / .single / .then / .order / .select-after-
// mutation). Each .select projection is copied verbatim from the call site so
// PostgREST column lists cannot drift — distinct projections get distinct
// functions.

// ── Reads ─────────────────────────────────────────────────────────────────────
/** Talent id only, by profile id (dashboard re-activation resolve — caller adds .maybeSingle()). */
export function talentIdByProfileId(profileId: string) {
  return supabase.from('talents').select('id').eq('profile_id', profileId)
}

/** Talent id + owning profile by id (InterviewFeedback participant check — caller adds .maybeSingle()). */
export function talentIdentityById(talentId: string) {
  return supabase.from('talents').select('id, profile_id').eq('id', talentId)
}

/** Talent extraction status by profile id (dashboard poll — caller adds .maybeSingle()). */
export function talentExtractionStatusByProfileId(profileId: string) {
  return supabase.from('talents').select('extraction_status').eq('profile_id', profileId)
}

/** Growth-nudge preferences by profile id (GrowthNudgePreferences — caller adds .maybeSingle().then()). */
export function talentGrowthNudgePrefsByProfileId(profileId: string) {
  return supabase
    .from('talents')
    .select('growth_nudges_opt_in, growth_nudge_snooze_until, last_growth_nudge_at')
    .eq('profile_id', profileId)
}

/** Editable talent-profile fields by profile id (TalentProfile load — caller adds .maybeSingle()). */
export function talentProfileFieldsByProfileId(profileId: string) {
  return supabase
    .from('talents')
    .select('id, expected_salary_min, expected_salary_max, is_open_to_offers, privacy_mode, whitelist_companies, preference_ratings, parsed_resume, extraction_status, extraction_error, extraction_started_at, photo_url')
    .eq('profile_id', profileId)
}

/** Full talent dashboard row by profile id (talent dashboard bootstrap — caller adds .maybeSingle()). */
export function talentDashboardRowByProfileId(profileId: string) {
  return supabase
    .from('talents')
    .select('id, extra_matches_used, profile_expires_at, reputation_score, feedback_volume, phs_show_rate, phs_accept_rate, current_employment_status, current_salary, notice_period_days, education_level, has_management_experience, work_authorization, preferred_management_style, expected_salary_min, expected_salary_max, employment_type_preferences, location_matters, career_goal_horizon, job_intention, has_noncompete, salary_structure_preference, role_scope_preference, reason_for_leaving_category, extraction_status')
    .eq('profile_id', profileId)
}

/** Open-to-offers talent pool for admin cold-start matching (caller awaits). */
export function openToOffersTalentPool() {
  return supabase
    .from('talents')
    .select('id, profile_id, derived_tags, expected_salary_min, expected_salary_max')
    .eq('is_open_to_offers', true)
    .limit(500)
}

/**
 * Tester talents (by profile email domain) for the dev-seed panel — embeds the
 * profile and filters on profiles.email; caller adds .like('profiles.email', …)
 * + .order. The embedded projection is multi-line to match the call site verbatim.
 */
export function testerTalentsForSeed() {
  return supabase
    .from('talents')
    .select(`
          id,
          profile_id,
          parsed_resume,
          interview_answers,
          profiles!inner (email, full_name)
        `)
}

// ── Writes ────────────────────────────────────────────────────────────────────
/**
 * Upsert a talent row keyed by profile (talent onboarding). Caller passes the
 * conflict target, e.g. { onConflict: 'profile_id' }, then chains
 * .select('id').single() to read back the new id.
 */
export function upsertTalent(
  row: Record<string, unknown>,
  options?: { onConflict?: string },
) {
  return supabase.from('talents').upsert(row, options)
}

/**
 * Patch a talent row by id (photo update, profile-edit save, dev-seed enrich/
 * reset, dashboard re-activation). Caller may chain .select(...).single() to
 * read the patched row back.
 */
export function updateTalentById(talentId: string, patch: Record<string, unknown>) {
  return supabase.from('talents').update(patch).eq('id', talentId)
}

/** Patch a talent row by owning profile id (growth-nudge opt-in / snooze clear). */
export function updateTalentByProfileId(profileId: string, patch: Record<string, unknown>) {
  return supabase.from('talents').update(patch).eq('profile_id', profileId)
}
