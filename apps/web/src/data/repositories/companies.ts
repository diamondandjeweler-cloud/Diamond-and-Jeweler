import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

export type CompanyUpdate = Database['public']['Tables']['companies']['Update']

// ── Companies + company↔HM link requests ─────────────────────────────────────
// Centralizes reads/writes of the companies and company_hm_link_requests
// tables. Mirrors systemConfig.ts / points.ts — every function returns the
// query BUILDER, so callers keep their own terminal operator (.then / await)
// and each .select projection is passed through verbatim from the call site.

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
  return supabase.from('companies').select('id').eq('primary_hr_email', email).maybeSingle()
}

/** Company existence check by id → { data: { id } | null } (HR dashboard add-me refresh). */
export function companyIdById(id: string) {
  return supabase.from('companies').select('id').eq('id', id).maybeSingle()
}

/** Company id by creator profile id → { data: { id } | null } (HMOnboarding self-heal). */
export function companyIdByCreator(userId: string) {
  return supabase.from('companies').select('id').eq('created_by', userId).maybeSingle()
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

/** Unverified companies, oldest first, capped at 100 (admin VerificationQueue). Caller keeps its .then tail. */
export function listUnverifiedCompanies() {
  return supabase
    .from('companies')
    .select('id, name, registration_number, primary_hr_email, business_license_path, created_at')
    .eq('verified', false)
    .order('created_at', { ascending: true })
    .limit(100)
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
