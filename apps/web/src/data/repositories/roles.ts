import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

// One alias per table this file writes.
type RoleInsert = Database['public']['Tables']['roles']['Insert']
type RoleUpdate = Database['public']['Tables']['roles']['Update']
type JobPostingDraftInsert = Database['public']['Tables']['job_posting_drafts']['Insert']

// ── Roles repository ──────────────────────────────────────────────────────────
// Centralizes every READ and WRITE of the `roles` table behind one seam (mirrors
// src/data/repositories/matches.ts). `roles` is hand-queried across the HM/HR/
// talent dashboards, both role-editing flows, onboarding and moderation, so each
// schema/column change was an O(N) manual edit before this.
//
// Read functions return the query BUILDER (not awaited) so call sites keep their
// own terminal operators (.maybeSingle / .single / .order / .limit / .abortSignal
// / count-head options / .then) — behaviour is byte-identical to the inlined
// queries they replace. Each .select projection is passed through VERBATIM from
// the call site so PostgREST column lists cannot drift. Where two call sites use
// different projections or filters, they get two functions (never widened to
// "fit" both).

// ── Reads ───────────────────────────────────────────────────────────────────
/** A role by id, full row (PostRole edit-mode pre-fill — caller adds .maybeSingle()). */
export function roleById(roleId: string) {
  return supabase.from('roles').select('*').eq('id', roleId)
}

/** A role's id + status by id (PostRole abort-recovery commit check — caller adds .maybeSingle()). */
export function roleStatusById(roleId: string) {
  return supabase.from('roles').select('id, status').eq('id', roleId)
}

/** A role by id, edit projection (EditRole pre-fill — caller adds .single()). */
export function roleEditById(roleId: string) {
  return supabase
    .from('roles')
    .select('id, hiring_manager_id, title, description, department, location, work_arrangement, experience_level, salary_min, salary_max, required_traits, status, from_onboarding')
    .eq('id', roleId)
}

/** A role by id, talent urgent-job projection (talent dashboard rehydrate — caller adds .maybeSingle()). */
export function roleTalentUrgentById(roleId: string) {
  return supabase
    .from('roles')
    .select('id, title, description, salary_min, salary_max, location, work_arrangement, status')
    .eq('id', roleId)
}

/** A hiring manager's roles, referral-redeem picker projection (caller adds .order()). */
export function rolesForRedeemPicker(hiringManagerId: string) {
  return supabase
    .from('roles')
    .select('id, title, status, extra_matches_used')
    .eq('hiring_manager_id', hiringManagerId)
}

/** Head count of a hiring manager's active roles (HM dashboard KPI — caller awaits directly). */
export function activeRoleCountForManager(hiringManagerId: string) {
  return supabase
    .from('roles')
    .select('id', { count: 'exact', head: true })
    .eq('hiring_manager_id', hiringManagerId)
    .eq('status', 'active')
}

/** A hiring manager's role list, HM dashboard projection (caller adds .limit()). */
export function rolesForManagerDashboard(hiringManagerId: string) {
  return supabase
    .from('roles')
    .select('id, title, status, extra_matches_used, created_at')
    .eq('hiring_manager_id', hiringManagerId)
}

/** A hiring manager's paused onboarding-draft role (HM dashboard — caller adds .maybeSingle()). */
export function onboardingDraftRoleForManager(hiringManagerId: string) {
  return supabase
    .from('roles')
    .select('id, title, industry, salary_min, salary_max, work_arrangement, required_traits')
    .eq('hiring_manager_id', hiringManagerId)
    .eq('from_onboarding', true)
    .eq('status', 'paused')
}

/** Existing paused onboarding-draft role id for a manager (HM onboarding idempotency — caller adds .maybeSingle()). */
export function onboardingDraftRoleIdForManager(hiringManagerId: string) {
  return supabase
    .from('roles')
    .select('id')
    .eq('hiring_manager_id', hiringManagerId)
    .eq('from_onboarding', true)
    .eq('status', 'paused')
}

/** A hiring manager's roles, MyRoles full projection (caller adds .order()). */
export function rolesForMyRoles(hiringManagerId: string) {
  return supabase
    .from('roles')
    .select('id, title, department, location, work_arrangement, experience_level, salary_min, salary_max, required_traits, required_skills, headcount, min_education_level, start_urgency, open_to, languages_required, status, created_at, vacancy_expires_at, moderation_status, moderation_reason, moderation_appealed_at, moderation_reviewed_at')
    .eq('hiring_manager_id', hiringManagerId)
}

/** Roles across a set of hiring managers, HR identity projection (caller adds .order()). */
export function rolesForManagers(hiringManagerIds: string[]) {
  return supabase
    .from('roles')
    .select('id, title, hiring_manager_id')
    .in('hiring_manager_id', hiringManagerIds)
}

/** Head count of roles in a moderation bucket (admin moderation counters — caller awaits directly). */
export function moderationRoleCountByStatus(moderationStatus: string) {
  return supabase
    .from('roles')
    .select('id', { count: 'exact', head: true })
    .eq('moderation_status', moderationStatus)
}

/** Roles in a moderation bucket, admin moderation projection (caller adds .order / .limit / .abortSignal). */
export function moderationRolesByStatus(moderationStatus: string) {
  return supabase
    .from('roles')
    .select(`
          id, title, description, industry, department, location, employment_type,
          salary_min, salary_max, hourly_rate, is_commission_based, status, created_at,
          moderation_status, moderation_score, moderation_category, moderation_reason,
          moderation_provider, moderation_checked_at, moderation_appeal_text,
          moderation_appealed_at,
          hiring_managers!inner(
            id, profile_id,
            companies(name),
            profiles!hiring_managers_profile_id_fkey(email, full_name)
          )
        `)
    .eq('moderation_status', moderationStatus)
}

// ── Writes ────────────────────────────────────────────────────────────────────
/** Patch a role by id (status transition, vacancy expiry, edits). */
export function updateRole(roleId: string, patch: RoleUpdate) {
  return supabase.from('roles').update(patch).eq('id', roleId)
}

/** Insert a role row (post-role flow / onboarding draft). */
export function insertRole(row: RoleInsert) {
  return supabase.from('roles').insert(row)
}

// ── Role reads ───────────────────────────────────────────────────────────────
// Read shapes migrated from page/hook call sites. Each function reproduces its
// original call-site chain verbatim (projection + filters + terminal operator);
// projections are intentionally NOT merged — the typed <Database> supabase
// client type-checks each .select column list, and every surface reads a
// different column set.

/** Edit-form load: one role by id with the editable columns (`.single()` — EditRole). */
export function getRoleForEdit(roleId: string) {
  return supabase
    .from('roles')
    .select('id, hiring_manager_id, title, description, department, location, work_arrangement, experience_level, salary_min, salary_max, required_traits, status, from_onboarding')
    .eq('id', roleId).single()
}

/** HM's role list with the wide moderation projection, newest first (MyRoles). */
export function listRolesWithModerationForHm(hmId: string) {
  return supabase
    .from('roles')
    .select('id, title, department, location, work_arrangement, experience_level, salary_min, salary_max, required_traits, required_skills, headcount, min_education_level, start_urgency, open_to, languages_required, status, created_at, vacancy_expires_at, moderation_status, moderation_reason, moderation_appealed_at, moderation_reviewed_at')
    .eq('hiring_manager_id', hmId)
    .order('created_at', { ascending: false })
}

/** Full role row by id for edit-mode prefill (`select('*')` — PostRole). */
export function getRoleFullById(roleId: string) {
  return supabase.from('roles').select('*').eq('id', roleId).maybeSingle()
}

/** Post-timeout commit check: id + status of one role (PostRole AbortError path). */
export function getRoleCommitCheck(roleId: string) {
  return supabase.from('roles').select('id, status').eq('id', roleId).maybeSingle()
}

/** Head-count of roles in one moderation bucket (admin ModerationPanel tabs). */
export function countRolesByModerationStatus(status: string) {
  return supabase.from('roles').select('id', { count: 'exact', head: true })
    .eq('moderation_status', status)
}

/** Moderation queue: roles in a bucket with HM/company/profile embeds, appeals first (admin ModerationPanel). Caller constructs the AbortSignal. */
export function listRolesForModeration(status: string, signal: AbortSignal) {
  return supabase
    .from('roles')
    .select(`
      id, title, description, industry, department, location, employment_type,
      salary_min, salary_max, hourly_rate, is_commission_based, status, created_at,
      moderation_status, moderation_score, moderation_category, moderation_reason,
      moderation_provider, moderation_checked_at, moderation_appeal_text,
      moderation_appealed_at,
      hiring_managers!inner(
        id, profile_id,
        companies(name),
        profiles!hiring_managers_profile_id_fkey(email, full_name)
      )
    `)
    .eq('moderation_status', status)
    .order('moderation_appealed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100)
    .abortSignal(signal)
}

/** Head-count of the HM's active roles (HM dashboard). */
export function countActiveRolesForHm(hmId: string) {
  return supabase.from('roles').select('id', { count: 'exact', head: true })
    .eq('hiring_manager_id', hmId).eq('status', 'active')
}

/** HM's role list for the dashboard (id/title/status/extra_matches_used/created_at, newest 200). */
export function listRolesForHmDashboard(hmId: string) {
  return supabase.from('roles')
    .select('id, title, status, extra_matches_used, created_at')
    .eq('hiring_manager_id', hmId)
    // Newest-first so the .limit(200) cap is DETERMINISTIC: without an order,
    // which 200 roles a >200-role tenant saw (dashboard cards AND the realtime
    // `role_id=in.(…)` filter built from these ids) was planner-arbitrary.
    // Newest roles are the ones being actively worked.
    .order('created_at', { ascending: false })
    .limit(200)
}

/** HM's paused onboarding-draft role with the dashboard-card columns (HM dashboard). */
export function getOnboardingDraftRoleForHm(hmId: string) {
  return supabase.from('roles').select('id, title, industry, salary_min, salary_max, work_arrangement, required_traits').eq('hiring_manager_id', hmId)
    .eq('from_onboarding', true).eq('status', 'paused').maybeSingle()
}

/** Roles for a set of HMs (id/title/hiring_manager_id), newest first (HR dashboard). */
export function listRolesForHms(hmIds: string[]) {
  return supabase
    .from('roles')
    .select('id, title, hiring_manager_id')
    .in('hiring_manager_id', hmIds)
    .order('created_at', { ascending: false })
}

/** Urgent-job result card: one role by id with the talent-dashboard columns. */
export function getUrgentRoleCard(roleId: string) {
  return supabase.from('roles')
    .select('id, title, description, salary_min, salary_max, location, work_arrangement, status')
    .eq('id', roleId)
    .maybeSingle()
}

/** HM's roles for the referral redeem picker (id/title/status/extra_matches_used), newest first. */
export function listRolesForRedeemPicker(hmId: string) {
  return supabase.from('roles')
    .select('id, title, status, extra_matches_used')
    .eq('hiring_manager_id', hmId)
    .order('created_at', { ascending: false })
}

/** Id of the HM's existing paused onboarding-draft role, if any (HMOnboarding idempotency check). */
export function getOnboardingDraftRoleId(hmId: string) {
  return supabase.from('roles')
    .select('id').eq('hiring_manager_id', hmId).eq('from_onboarding', true).eq('status', 'paused').maybeSingle()
}

// ── Role drafts (job_posting_drafts) ─────────────────────────────────────────
// The HM's in-progress role-posting draft — one row per hm_id, the cloud
// counterpart to PostRole's localStorage draft. Builder-return convention.

/** Read the HM's saved cloud draft → { data: { draft_data, updated_at } | null, error }. */
export function getRoleDraft(hmId: string) {
  return supabase.from('job_posting_drafts').select('draft_data, updated_at').eq('hm_id', hmId).maybeSingle()
}

/** Upsert the HM's cloud draft (one row per hm_id). */
export function saveRoleDraft(hmId: string, draftData: unknown) {
  // draftData is the caller's serialized draft (structurally JSON) but typed `unknown`
  // at this seam; boundary-cast the payload to the generated Insert shape.
  const row: JobPostingDraftInsert = { hm_id: hmId, draft_data: draftData as JobPostingDraftInsert['draft_data'] }
  return supabase.from('job_posting_drafts').upsert(row, { onConflict: 'hm_id' })
}

/** Delete the HM's cloud draft (post-submit cleanup / discard). */
export function deleteRoleDraft(hmId: string) {
  return supabase.from('job_posting_drafts').delete().eq('hm_id', hmId)
}
