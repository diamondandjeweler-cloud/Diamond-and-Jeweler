import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type TalentInsert = Database['public']['Tables']['talents']['Insert']
type TalentUpdate = Database['public']['Tables']['talents']['Update']

// ── Talents domain ───────────────────────────────────────────────────────────
// Centralizes reads/writes of the talents table plus the talent-side RPCs
// (active_talent_count, growth/career nudges). Mirrors matches.ts /
// systemConfig.ts — functions return the query BUILDER so callers keep their
// own await / .then placement, and every .select projection is passed through
// verbatim from the original call site — the typed <Database> client
// type-checks each column list (PDPA column isolation: never widen).
//
// Some functions bake in their terminal operator (.maybeSingle / .select('id')
// .single()) because their call sites await them directly; the bare-builder
// variants (talentIdentityById, talentGrowthNudgePrefsByProfileId,
// talentProfileFieldsByProfileId, talentDashboardRowByProfileId,
// openToOffersTalentPool, testerTalentsForSeed) leave the terminal operator to
// the caller.

/** Talent row for the profile editor (TalentProfile) → maybeSingle. */
export function talentProfileByProfileId(profileId: string) {
  return supabase
    .from('talents')
    .select('id, expected_salary_min, expected_salary_max, is_open_to_offers, privacy_mode, whitelist_companies, preference_ratings, parsed_resume, extraction_status, extraction_error, extraction_started_at, photo_url')
    .eq('profile_id', profileId)
    .maybeSingle()
}

/** Editable talent-profile fields by profile id (bare builder variant — caller adds .maybeSingle()). */
export function talentProfileFieldsByProfileId(profileId: string) {
  return supabase
    .from('talents')
    .select('id, expected_salary_min, expected_salary_max, is_open_to_offers, privacy_mode, whitelist_companies, preference_ratings, parsed_resume, extraction_status, extraction_error, extraction_started_at, photo_url')
    .eq('profile_id', profileId)
}

/** Wide talent snapshot for the talent dashboard KPI/gap strip → maybeSingle. */
export function talentDashboardSnapshotByProfileId(profileId: string) {
  return supabase.from('talents').select('id, extra_matches_used, profile_expires_at, reputation_score, feedback_volume, phs_show_rate, phs_accept_rate, current_employment_status, current_salary, notice_period_days, education_level, has_management_experience, work_authorization, preferred_management_style, expected_salary_min, expected_salary_max, employment_type_preferences, location_matters, career_goal_horizon, job_intention, has_noncompete, salary_structure_preference, role_scope_preference, reason_for_leaving_category, extraction_status').eq('profile_id', profileId).maybeSingle()
}

/** Full talent dashboard row by profile id (bare builder variant — caller adds .maybeSingle()). */
export function talentDashboardRowByProfileId(profileId: string) {
  return supabase
    .from('talents')
    .select('id, extra_matches_used, profile_expires_at, reputation_score, feedback_volume, phs_show_rate, phs_accept_rate, current_employment_status, current_salary, notice_period_days, education_level, has_management_experience, work_authorization, preferred_management_style, expected_salary_min, expected_salary_max, employment_type_preferences, location_matters, career_goal_horizon, job_intention, has_noncompete, salary_structure_preference, role_scope_preference, reason_for_leaving_category, extraction_status')
    .eq('profile_id', profileId)
}

/** extraction_status only — 10s polling tick while extraction is in flight → maybeSingle. */
export function talentExtractionStatusByProfileId(profileId: string) {
  return supabase
    .from('talents')
    .select('extraction_status')
    .eq('profile_id', profileId)
    .maybeSingle()
}

/** Talent id lookup by owning profile (profile revive) → maybeSingle. */
export function talentIdByProfileId(profileId: string) {
  return supabase.from('talents').select('id').eq('profile_id', profileId).maybeSingle()
}

/** Ownership check for the interview-feedback page (id + profile_id) → maybeSingle. */
export function talentOwnershipById(talentId: string) {
  return supabase
    .from('talents').select('id, profile_id').eq('id', talentId).maybeSingle()
}

/** Talent id + owning profile by id (bare builder variant — caller adds .maybeSingle()). */
export function talentIdentityById(talentId: string) {
  return supabase.from('talents').select('id, profile_id').eq('id', talentId)
}

/** Open-to-offers talent pool for admin cold-start manual pairing (cap 500). */
export function coldStartTalentPool() {
  return supabase
    .from('talents')
    .select('id, profile_id, derived_tags, expected_salary_min, expected_salary_max')
    .eq('is_open_to_offers', true)
    .limit(500)
}

/** Open-to-offers talent pool for admin cold-start matching (alias of coldStartTalentPool — caller awaits). */
export function openToOffersTalentPool() {
  return coldStartTalentPool()
}

/** Tester talents (profiles!inner email match) for the dev seed panel; caller passes the LIKE pattern. */
export function testerTalents(emailLikePattern: string) {
  return supabase
    .from('talents')
    .select(`
          id,
          profile_id,
          parsed_resume,
          interview_answers,
          profiles!inner (email, full_name)
        `)
    .like('profiles.email', emailLikePattern)
    .order('created_at', { ascending: true })
}

/**
 * Tester talents (by profile email domain) for the dev-seed panel — embeds the
 * profile and filters on profiles.email; caller adds .like('profiles.email', …)
 * + .order (bare builder variant of testerTalents).
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

/** Growth-nudge preference columns (PDPA-isolated 3-column projection) → maybeSingle; caller keeps its .then. */
export function growthNudgePrefsByProfileId(profileId: string) {
  return supabase.from('talents')
    .select('growth_nudges_opt_in, growth_nudge_snooze_until, last_growth_nudge_at')
    .eq('profile_id', profileId)
    .maybeSingle()
}

/** Growth-nudge preferences by profile id (bare builder variant — caller adds .maybeSingle().then()). */
export function talentGrowthNudgePrefsByProfileId(profileId: string) {
  return supabase
    .from('talents')
    .select('growth_nudges_opt_in, growth_nudge_snooze_until, last_growth_nudge_at')
    .eq('profile_id', profileId)
}

// ── Mutations ────────────────────────────────────────────────────────────────
/** Patch a talent row by id — base builder; callers may chain .select()/.single(). */
export function updateTalentById(talentId: string, patch: TalentUpdate) {
  return supabase.from('talents').update(patch).eq('id', talentId)
}

/** Patch a talent row by owning profile id (growth-nudge prefs). */
export function updateTalentByProfileId(profileId: string, patch: TalentUpdate) {
  return supabase.from('talents').update(patch).eq('profile_id', profileId)
}

function upsertTalentBaked(payload: TalentInsert) {
  return supabase.from('talents').upsert(payload, { onConflict: 'profile_id' }).select('id').single()
}

function upsertTalentBare(row: TalentInsert, options?: { onConflict?: string }) {
  return supabase.from('talents').upsert(row, options)
}

/** Upsert the talents row at onboarding (payload built at call site) → select('id').single(). */
export function upsertTalent(payload: TalentInsert): ReturnType<typeof upsertTalentBaked>
/**
 * Upsert a talent row with an explicit conflict target (bare builder variant —
 * caller chains .select('id').single() to read back the new id).
 */
export function upsertTalent(
  row: TalentInsert,
  options: { onConflict?: string },
): ReturnType<typeof upsertTalentBare>
export function upsertTalent(payload: TalentInsert, options?: { onConflict?: string }) {
  return options ? upsertTalentBare(payload, options) : upsertTalentBaked(payload)
}

// ── RPC wrappers ─────────────────────────────────────────────────────────────
/** RPC: count of active talents (cold-start auto-switch threshold / waiting-band estimate). */
export function activeTalentCount() {
  return supabase.rpc('active_talent_count')
}

/** RPC: snooze growth nudges for N months → returns the new snooze-until timestamp. */
export function snoozeGrowthNudges(months: number) {
  return supabase.rpc('snooze_growth_nudges', { p_months: months })
}

/** RPC: career-nudge category for a calendar year; caller keeps its .then. */
export function getCareerNudge(year: number) {
  return supabase.rpc('get_career_nudge', { p_year: year })
}
