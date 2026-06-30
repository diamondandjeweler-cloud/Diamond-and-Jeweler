import { supabase } from '../../lib/supabase'

// ── Company reads & writes ────────────────────────────────────────────────────
// `companies` is the employer root behind onboarding registration/verification,
// the HR + HM dashboard bootstraps and the admin verification queue. This
// centralizes those queries behind one seam (mirrors src/data/repositories/
// matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.maybeSingle / .single / .then / .order / .select-after-
// insert). Each .select projection is copied verbatim from the call site so
// PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/** Company id by id (HR add-HM company existence check — caller adds .maybeSingle()). */
export function companyIdById(companyId: string) {
  return supabase.from('companies').select('id').eq('id', companyId)
}

/**
 * Company id by primary HR email (HR/admin dashboard self-resolve + HM-onboarding
 * heal-by-email — caller adds .maybeSingle()).
 */
export function companyIdByPrimaryHrEmail(email: string) {
  return supabase.from('companies').select('id').eq('primary_hr_email', email)
}

/** Company id by creator profile (HM-onboarding heal — caller adds .maybeSingle()). */
export function companyIdByCreatedBy(profileId: string) {
  return supabase.from('companies').select('id').eq('created_by', profileId)
}

/** Company verified flag by id (HM dashboard verification banner — caller adds .maybeSingle().then()). */
export function companyVerifiedById(companyId: string) {
  return supabase.from('companies').select('verified').eq('id', companyId)
}

/** Company verification fields by id (CompanyVerify load — caller adds .maybeSingle().then()). */
export function companyVerifyRowById(companyId: string) {
  return supabase
    .from('companies')
    .select('id, name, registration_number, verified')
    .eq('id', companyId)
}

/** Unverified companies awaiting admin review (verification queue — caller adds .then()). */
export function unverifiedCompanies() {
  return supabase
    .from('companies')
    .select('id, name, registration_number, primary_hr_email, business_license_path, created_at')
    .eq('verified', false)
    .order('created_at', { ascending: true })
    .limit(100)
}

// ── Writes ────────────────────────────────────────────────────────────────────
/**
 * Insert a company row (company registration). Caller chains
 * .select('id').single() to read back the new id.
 */
export function insertCompany(row: Record<string, unknown>) {
  return supabase.from('companies').insert(row)
}

/** Patch a company row by id (admin verify, CompanyVerify self-update). */
export function updateCompanyById(companyId: string, patch: Record<string, unknown>) {
  return supabase.from('companies').update(patch).eq('id', companyId)
}
