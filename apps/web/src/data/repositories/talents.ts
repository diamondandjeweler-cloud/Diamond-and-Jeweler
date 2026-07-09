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

/** Talent row for the profile editor (TalentProfile) → maybeSingle. */
export function talentProfileByProfileId(profileId: string) {
  return supabase
    .from('talents')
    .select('id, expected_salary_min, expected_salary_max, is_open_to_offers, privacy_mode, whitelist_companies, preference_ratings, parsed_resume, extraction_status, extraction_error, extraction_started_at, photo_url')
    .eq('profile_id', profileId)
    .maybeSingle()
}

/** Wide talent snapshot for the talent dashboard KPI/gap strip → maybeSingle. */
export function talentDashboardSnapshotByProfileId(profileId: string) {
  return supabase.from('talents').select('id, extra_matches_used, profile_expires_at, reputation_score, feedback_volume, phs_show_rate, phs_accept_rate, current_employment_status, current_salary, notice_period_days, education_level, has_management_experience, work_authorization, preferred_management_style, expected_salary_min, expected_salary_max, employment_type_preferences, location_matters, career_goal_horizon, job_intention, has_noncompete, salary_structure_preference, role_scope_preference, reason_for_leaving_category, extraction_status').eq('profile_id', profileId).maybeSingle()
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

/** Open-to-offers talent pool for admin cold-start manual pairing (cap 500). */
export function coldStartTalentPool() {
  return supabase
    .from('talents')
    .select('id, profile_id, derived_tags, expected_salary_min, expected_salary_max')
    .eq('is_open_to_offers', true)
    .limit(500)
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

/** Growth-nudge preference columns (PDPA-isolated 3-column projection) → maybeSingle; caller keeps its .then. */
export function growthNudgePrefsByProfileId(profileId: string) {
  return supabase.from('talents')
    .select('growth_nudges_opt_in, growth_nudge_snooze_until, last_growth_nudge_at')
    .eq('profile_id', profileId)
    .maybeSingle()
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

/** Upsert the talents row at onboarding (payload built at call site) → select('id').single(). */
export function upsertTalent(payload: TalentInsert) {
  return supabase.from('talents').upsert(payload, { onConflict: 'profile_id' }).select('id').single()
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
