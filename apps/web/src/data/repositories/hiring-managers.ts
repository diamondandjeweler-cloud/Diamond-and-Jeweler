import { supabase } from '../../lib/supabase'

// ── Hiring-manager reads & writes ────────────────────────────────────────────
// `hiring_managers` is the identity row behind every HM/HR surface: onboarding
// healing, dashboard bootstraps, role ownership checks, the HR member roster and
// the admin link panel all hand-query it. This centralizes those queries behind
// one seam (mirrors src/data/repositories/matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.maybeSingle / .single / .then / .order). Each .select
// projection is passed through verbatim from the call site so PostgREST column
// lists cannot drift. NOTE: state/useSession.ts deliberately reads this table via
// a raw authenticated fetch (not the builder) to dodge a token-attachment quirk,
// so that path is intentionally NOT routed through this module.

// ── Reads ─────────────────────────────────────────────────────────────────────
/**
 * HM id only, by profile id (onboarding preflight, Referrals, MyRoles,
 * PostRole, talent-side HM resolves — caller adds .maybeSingle()).
 */
export function hmIdByProfileId(profileId: string) {
  return supabase.from('hiring_managers').select('id').eq('profile_id', profileId)
}

/** HM id by id + owning profile (EditRole ownership guard — caller adds .maybeSingle()). */
export function hmIdByIdAndProfileId(hmId: string, profileId: string) {
  return supabase.from('hiring_managers').select('id').eq('id', hmId).eq('profile_id', profileId)
}

/** HM id + owning profile by id (InterviewFeedback participant check — caller adds .maybeSingle()). */
export function hmIdentityById(hmId: string) {
  return supabase.from('hiring_managers').select('id, profile_id').eq('id', hmId)
}

/** HM job title + embedded company by profile id (HMCompanyProfile — caller adds .maybeSingle()). */
export function hmCompanyProfileByProfileId(profileId: string) {
  return supabase
    .from('hiring_managers')
    .select('job_title, companies(name, industry, size, website, verified)')
    .eq('profile_id', profileId)
}

/** HM scoring/reputation row by profile id (HM dashboard bootstrap — caller adds .maybeSingle()). */
export function hmDashboardRowByProfileId(profileId: string) {
  return supabase
    .from('hiring_managers')
    .select('id, company_id, reputation_score, feedback_volume, phs_offer_accept_rate, hm_quality_factor, hm_cancel_rate, date_of_birth_encrypted')
    .eq('profile_id', profileId)
}

/** HM roster for a company, with embedded profile name (HR dashboard — caller awaits). */
export function hmRosterForCompany(companyId: string) {
  return supabase
    .from('hiring_managers')
    .select('id, profile_id, job_title, profiles!inner(full_name)')
    .eq('company_id', companyId)
}

/** Floating HMs (no company) for the admin link panel — caller awaits. */
export function floatingHms() {
  return supabase
    .from('hiring_managers')
    .select('id, job_title, created_at, profiles(full_name, email)')
    .is('company_id', null)
    .order('created_at', { ascending: false })
    .limit(100)
}

/** HMs already linked to a company (admin link panel) — caller awaits. */
export function linkedHmsForCompany(companyId: string) {
  return supabase
    .from('hiring_managers')
    .select('id, job_title, profiles(full_name, email)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
}

// ── Writes ────────────────────────────────────────────────────────────────────
/** Insert an HM row (HR "add me as HM" flow). */
export function insertHiringManager(row: Record<string, unknown>) {
  return supabase.from('hiring_managers').insert(row)
}

/**
 * Upsert an HM row keyed by profile (onboarding heal + company-register link).
 * Caller passes the conflict target, e.g. { onConflict: 'profile_id' }.
 */
export function upsertHiringManager(
  row: Record<string, unknown>,
  options?: { onConflict?: string },
) {
  return supabase.from('hiring_managers').upsert(row, options)
}

/** Patch an HM row by id (DOB/life-chart enrichment from the add-DOB modal). */
export function updateHiringManagerById(hmId: string, patch: Record<string, unknown>) {
  return supabase.from('hiring_managers').update(patch).eq('id', hmId)
}

/**
 * Patch an HM row by owning profile id (onboarding interview-answer saves,
 * job-title edit, DOB/life-chart + extracted-attributes enrichment).
 */
export function updateHiringManagerByProfileId(profileId: string, patch: Record<string, unknown>) {
  return supabase.from('hiring_managers').update(patch).eq('profile_id', profileId)
}
