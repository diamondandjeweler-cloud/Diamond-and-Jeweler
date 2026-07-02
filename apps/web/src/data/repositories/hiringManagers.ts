import { supabase } from '../../lib/supabase'

// ── hiring_managers: HM identity, company link + onboarding profile rows ─────
// Centralizes reads/writes of the hiring_managers table. Mirrors systemConfig.ts
// / points.ts — every function returns the query BUILDER, so callers keep their
// own terminal operator (.maybeSingle / .then / await) and each .select
// projection is passed through verbatim from the original call site.

/** HM id for a profile → { data: { id } | null } (MyRoles / PostRole / Referrals / HMOnboarding). */
export function hmIdByProfileId(profileId: string) {
  return supabase.from('hiring_managers').select('id').eq('profile_id', profileId).maybeSingle()
}

/** Ownership check: HM id matching BOTH the role's hiring_manager_id and the caller's profile (EditRole). */
export function hmIdByIdAndProfileId(hmId: string, profileId: string) {
  return supabase.from('hiring_managers')
    .select('id').eq('id', hmId).eq('profile_id', profileId).maybeSingle()
}

/** HM id + profile_id by row id → participant-side check (InterviewFeedback). */
export function hmProfileLinkById(hmId: string) {
  return supabase
    .from('hiring_managers')
    .select('id, profile_id')
    .eq('id', hmId)
    .maybeSingle()
}

/** HM job title with embedded company details for a profile (HMCompanyProfile; caller guards non-null at runtime). */
export function hmCompanyProfileByProfileId(profileId: string | undefined) {
  return supabase
    .from('hiring_managers')
    .select('job_title, companies(name, industry, size, website, verified)')
    .eq('profile_id', profileId)
    .maybeSingle()
}

/** HM dashboard row (company link + reputation stats + encrypted DOB) for a profile (useHmDashboardData; PDPA: projection verbatim). */
export function hmDashboardRowByProfileId(profileId: string) {
  return supabase.from('hiring_managers').select('id, company_id, reputation_score, feedback_volume, phs_offer_accept_rate, hm_quality_factor, hm_cancel_rate, date_of_birth_encrypted').eq('profile_id', profileId).maybeSingle()
}

/** Floating HMs (no company yet), newest first, capped at 100 (admin LinkHMPanel). */
export function listFloatingHms() {
  return supabase
    .from('hiring_managers')
    .select('id, job_title, created_at, profiles(full_name, email)')
    .is('company_id', null)
    .order('created_at', { ascending: false })
    .limit(100)
}

/** HMs already linked to a company, newest first (admin LinkHMPanel). */
export function listLinkedHmsForCompany(companyId: string) {
  return supabase
    .from('hiring_managers')
    .select('id, job_title, profiles(full_name, email)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
}

/** All HMs in a company with their profile names (useHrDashboardData list + add-me refresh). */
export function hmsWithNamesByCompanyId(companyId: string) {
  return supabase
    .from('hiring_managers')
    .select('id, profile_id, job_title, profiles!inner(full_name)')
    .eq('company_id', companyId)
}

/** Insert a new HM row (HR dashboard "add me as hiring manager"). */
export function insertHm(profileId: string, companyId: string, jobTitle: string) {
  return supabase.from('hiring_managers').insert({
    profile_id: profileId,
    company_id: companyId,
    job_title: jobTitle,
  })
}

/** Upsert the HM↔company link keyed on profile_id (CompanyRegister + HMOnboarding self-heal). */
export function upsertHmCompanyLink(profileId: string, companyId: string) {
  return supabase.from('hiring_managers').upsert(
    { profile_id: profileId, company_id: companyId, job_title: 'Hiring Manager' },
    { onConflict: 'profile_id' },
  )
}

/** Update the HM's job title by profile id (HMCompanyProfile save; builder passed into Promise.all). */
export function updateHmJobTitleByProfileId(profileId: string, jobTitle: string) {
  return supabase.from('hiring_managers').update({ job_title: jobTitle }).eq('profile_id', profileId)
}

/** Save the onboarding chat transcript on the HM row (HMOnboarding; builder passed into Promise.all — no await here). */
export function updateHmInterviewTranscript(profileId: string, transcript: unknown[]) {
  return supabase.from('hiring_managers').update({ interview_answers: { transcript } }).eq('profile_id', profileId)
}

/** Apply a caller-built update payload to an HM row by id (HMOnboarding profile save / AddHmDobModal DOB save). */
export function updateHmById(payload: Record<string, unknown>, hmId: string) {
  return supabase.from('hiring_managers').update(payload).eq('id', hmId)
}
