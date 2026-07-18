import { supabase } from '../../lib/supabase'
import { escapeLikePattern } from '../../lib/likePattern'
import type { Database } from '../../types/db.generated'

export type CompanyUpdate = Database['public']['Tables']['companies']['Update']

// ── Companies + company↔HM link requests ─────────────────────────────────────
// Centralizes reads/writes of the companies and company_hm_link_requests
// tables. Mirrors systemConfig.ts / points.ts — every function returns the
// query BUILDER, so callers keep their own terminal operator (.then / await)
// and each .select projection is passed through verbatim from the call site.
//
// Note: some functions bake in their terminal operator (.maybeSingle /
// .select('id').single()) because their call sites await them directly; the
// bare-builder variants (companyIdByPrimaryHrEmail, companyIdByCreatedBy,
// companyVerifyRowById, unverifiedCompanies) leave the terminal operator to
// the caller.

/** Company row shape accepted by insertCompany (CompanyRegister). */
export interface NewCompany {
  name: string
  registration_number: string
  business_license_path: string | null
  website: string | null
  size: string
  industry: string | null
  primary_hr_email: string
  created_by: string
}

/** Company id by primary HR email → { data: { id } | null } (LinkHMPanel / HR dashboard / HMOnboarding self-heal). */
export function companyIdByHrEmail(email: string) {
  // Match the DB binding's normalization. The RLS helper auth_hr_company_id()
  // (migration 0180) resolves the company via lower(trim(primary_hr_email)), so
  // an admin whose login email is 'HR@Acme.com' IS granted access to a company
  // stored as 'hr@acme.com' — but a raw case-sensitive `.eq` here returns null
  // and locks them out of their own dashboard. Compare case-insensitively on the
  // trimmed email (ILIKE), escaping LIKE metacharacters (underscores are valid in
  // email local-parts) so the lookup behaves as an exact, case-insensitive match.
  return supabase.from('companies').select('id')
    .ilike('primary_hr_email', escapeLikePattern(email.trim()))
    .limit(1).maybeSingle()
}

/** Single-round-trip HR dashboard bootstrap via the hr_dashboard_bootstrap RPC
 *  (migration 0195) → { data: jsonb | null, error }. Mirrors the HR dashboard
 *  waterfall (company + hms + open_roles + pending + scheduled + outcomes) in one
 *  call; callers fall back to the multi-phase repos on any error. Authz is
 *  enforced in the SECURITY DEFINER function (caller must own the company email
 *  or be admin). */
export function hrDashboardBootstrap(email: string) {
  return supabase.rpc('hr_dashboard_bootstrap', { p_email: email })
}

/**
 * Company id by primary HR email (bare builder variant — caller adds .maybeSingle()).
 */
export function companyIdByPrimaryHrEmail(email: string) {
  return supabase.from('companies').select('id').eq('primary_hr_email', email)
}

/** Company existence check by id → { data: { id } | null } (HR dashboard add-me refresh). */
export function companyIdById(id: string) {
  return supabase.from('companies').select('id').eq('id', id).maybeSingle()
}

/** Company id by creator profile id → { data: { id } | null } (HMOnboarding self-heal). */
export function companyIdByCreator(userId: string) {
  return supabase.from('companies').select('id').eq('created_by', userId).maybeSingle()
}

/** Company id by creator profile (bare builder variant — caller adds .maybeSingle()). */
export function companyIdByCreatedBy(profileId: string) {
  return supabase.from('companies').select('id').eq('created_by', profileId)
}

/** Company verified flag by id → { data: { verified } | null } (HM dashboard company-context branch). */
export function companyVerifiedById(id: string) {
  return supabase.from('companies').select('verified').eq('id', id).maybeSingle()
}

/** Company record for the verification page → { data: { id, name, registration_number, verified } | null } (CompanyVerify). */
export function companyForVerifyById(id: string) {
  return supabase
    .from('companies')
    .select('id, name, registration_number, verified')
    .eq('id', id)
    .maybeSingle()
}

/** Company verification fields by id (bare builder variant — caller adds .maybeSingle().then()). */
export function companyVerifyRowById(companyId: string) {
  return supabase
    .from('companies')
    .select('id, name, registration_number, verified')
    .eq('id', companyId)
}

/** Unverified companies, oldest first, capped at 100 (admin VerificationQueue). Caller keeps its .then tail. */
export function listUnverifiedCompanies() {
  return supabase
    .from('companies')
    .select('id, name, registration_number, primary_hr_email, business_license_path, created_at')
    .eq('verified', false)
    .order('created_at', { ascending: true })
    .limit(100)
}

/** Unverified companies awaiting admin review (alias of listUnverifiedCompanies — caller adds .then()). */
export function unverifiedCompanies() {
  return listUnverifiedCompanies()
}

/** Mark a company verified now → { error } (admin VerificationQueue). */
export function markCompanyVerified(id: string) {
  return supabase
    .from('companies')
    .update({ verified: true, verified_at: new Date().toISOString() })
    .eq('id', id)
}

/** Insert a company and return its new id via .select('id').single() (CompanyRegister). */
export function insertCompany(payload: NewCompany) {
  return supabase.from('companies').insert(payload).select('id').single()
}

/** Apply a dynamically-built update ({ registration_number } + optional business_license_path) by id → { error } (CompanyVerify). */
export function updateCompanyById(id: string, update: CompanyUpdate) {
  return supabase.from('companies').update(update).eq('id', id)
}

/** Pending link request for an HM with the requesting company's name embedded (HM dashboard). Caller keeps its .then tail. */
export function pendingLinkRequestForHm(hmId: string) {
  return supabase
    .from('company_hm_link_requests')
    .select('id, companies(name)')
    .eq('hm_id', hmId)
    .eq('status', 'pending')
    .maybeSingle()
}

/** hm_ids of pending link requests already sent by a company (LinkHMPanel). */
export function pendingLinkRequestHmIds(companyId: string) {
  return supabase
    .from('company_hm_link_requests')
    .select('hm_id')
    .eq('company_id', companyId)
    .eq('status', 'pending')
}
