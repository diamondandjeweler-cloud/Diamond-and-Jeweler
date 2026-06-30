import { supabase } from '../../lib/supabase'

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
export function updateRole(roleId: string, patch: Record<string, unknown>) {
  return supabase.from('roles').update(patch).eq('id', roleId)
}

/** Insert a role row (post-role flow / onboarding draft). */
export function insertRole(row: Record<string, unknown>) {
  return supabase.from('roles').insert(row)
}
