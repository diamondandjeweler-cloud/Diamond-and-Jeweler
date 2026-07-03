import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type MatchInsert = Database['public']['Tables']['matches']['Insert']
type MatchUpdate = Database['public']['Tables']['matches']['Update']
type MatchHistoryInsert = Database['public']['Tables']['match_history']['Insert']

// ── Match queries (recruitment) ──────────────────────────────────────────────
// First slice of the data-access layer. AUDIT CLEAN_ARCH: ~149 direct supabase
// calls bypass a repository seam, and `matches` is hand-queried from 8 route
// files — every schema/column change is an O(N) manual edit. Centralizing the
// talent-facing projection here makes it the SINGLE SOURCE OF TRUTH: it was
// copy-pasted verbatim across two TalentDashboard call sites, and it must NEVER
// include the HM-private columns (internal_reasoning, life_chart_score).
//
// These return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.order / .maybeSingle / .abortSignal) — behaviour is
// byte-identical to the inlined queries they replace.

// Keep as ONE literal string (identical to the call sites it replaces) so the
// PostgREST projection cannot drift via a concatenation typo.
const TALENT_MATCH_SELECT =
  'id, compatibility_score, status, expires_at, public_reasoning, application_summary, roles(id, title, description, salary_min, salary_max, location, work_arrangement, employment_type, hourly_rate, duration_days)'

/** Talent's matches filtered by status (caller adds ordering). */
export function talentMatchesForTalent(talentId: string, statuses: readonly string[]) {
  return supabase
    .from('matches')
    .select(TALENT_MATCH_SELECT)
    .eq('talent_id', talentId)
    .in('status', statuses as string[])
}

/** A single match by id, talent projection (caller adds .maybeSingle()). */
export function talentMatchById(matchId: string) {
  return supabase
    .from('matches')
    .select(TALENT_MATCH_SELECT)
    .eq('id', matchId)
}

// HM-facing candidate projection — was also copy-pasted across two HMDashboard
// call sites. Note `public_reasoning` (never internal_reasoning/life_chart_score).
const HM_CANDIDATE_SELECT =
  'id, compatibility_score, status, is_urgent, public_reasoning, application_summary, talents(id, privacy_mode, derived_tags, expected_salary_min, expected_salary_max), roles!inner(id, title, hiring_manager_id), match_feedback(rating, hired, notes)'

/** Candidates for a hiring manager's roles, filtered by status (caller orders). */
export function hmCandidatesForManager(hiringManagerId: string, statuses: readonly string[]) {
  return supabase
    .from('matches')
    .select(HM_CANDIDATE_SELECT)
    .eq('roles.hiring_manager_id', hiringManagerId)
    .in('status', statuses as string[])
}

/** A single candidate by match id, HM projection (caller adds .maybeSingle()). */
export function hmCandidateById(matchId: string) {
  return supabase
    .from('matches')
    .select(HM_CANDIDATE_SELECT)
    .eq('id', matchId)
}

// ── HR scheduling reads ──────────────────────────────────────────────────────
/** Matches awaiting HR scheduling for a set of roles (caller orders). */
export function hrPendingMatches(roleIds: string[]) {
  return supabase
    .from('matches')
    .select('id, status, compatibility_score, roles(id, title), talents(id, profile_id)')
    .in('role_id', roleIds)
    .in('status', ['invited_by_manager', 'hr_scheduling'])
}

/** Post-interview matches with their feedback rows (for the outcomes-pending count). */
export function hrOutcomesPendingMatches(roleIds: string[]) {
  return supabase
    .from('matches')
    .select('id, match_feedback(id)')
    .in('role_id', roleIds)
    .in('status', ['interview_completed', 'hired'])
}

// ── Misc single-purpose reads ────────────────────────────────────────────────
/** Match + ownership info for the interview-feedback page (caller adds .single()). */
export function matchForFeedback(matchId: string) {
  return supabase
    .from('matches')
    .select('id, status, role_id, talent_id, roles(title, hiring_manager_id)')
    .eq('id', matchId)
}

/** Head count of still-active matches for a role (MyRoles badge). */
export function activeMatchCountForRole(roleId: string) {
  return supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId)
    .in('status', ['generated', 'viewed', 'accepted_by_talent', 'invited_by_manager', 'hr_scheduling', 'interview_scheduled'])
}

/** Talent ids already matched to a role (cold-start exclusion set). */
export function matchedTalentIdsForRole(roleId: string) {
  return supabase.from('matches').select('talent_id').eq('role_id', roleId)
}

/** Head count of hired matches across a set of roles (HM all-time hired tally). */
export function hiredMatchCountForRoles(roleIds: string[]) {
  return supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'hired')
    .in('role_id', roleIds)
}

/** role_id of every active match across a set of roles (HM per-role active counts). */
export function activeMatchRoleIds(roleIds: string[], statuses: readonly string[]) {
  return supabase
    .from('matches')
    .select('role_id')
    .in('role_id', roleIds)
    .in('status', statuses as string[])
}

// Admin scoring-input embed — life_chart_score/internal_reasoning are NOT here
// (revoked from `authenticated` in 0158); the panel merges those via the
// is_admin()-gated RPC. Caller adds .order / .limit / .abortSignal.
export function pendingApprovalMatches() {
  return supabase
    .from('matches')
    .select(`
          id, compatibility_score, tag_compatibility, created_at,
          roles(title, industry, description, hiring_managers(life_chart_character, date_of_birth_encrypted)),
          talents(id, life_chart_character, date_of_birth_encrypted, derived_tags)
        `)
    .eq('status', 'pending_approval')
}

// ── Match-pipeline RPC wrappers ──────────────────────────────────────────────
// Builder-returning like the reads above: callers keep their own await /
// Promise.all placement / error handling, payload shapes are verbatim.

/** Admin match list via the SECURITY DEFINER get_admin_matches RPC (F8). */
export function getAdminMatches(pStatus: string | null, pLimit: number) {
  return supabase.rpc('get_admin_matches', { p_status: pStatus, p_limit: pLimit })
}

/** Admin-only scoring detail (life_chart_score/internal_reasoning) for pending approvals — is_admin()-gated RPC. */
export function getPendingMatchReasoning() {
  return supabase.rpc('get_pending_match_reasoning')
}

/** Decrypt an encrypted DOB (admin-gated RPC; caller keeps its ternary Promise.resolve fallback). */
export function decryptDob(encrypted: string) {
  return supabase.rpc('decrypt_dob', { encrypted })
}

/** Profile previews for a set of match ids in one round-trip. */
export function getMatchProfilePreviews(matchIds: string[]) {
  return supabase.rpc('get_match_profile_previews', { p_match_ids: matchIds })
}

/** Talent contact reveal for a match (status-gated RPC). */
export function getTalentContact(matchId: string) {
  return supabase.rpc('get_talent_contact', { p_match_id: matchId })
}

/** PDPA CV-download audit emit — callers MUST block the download when this errors. */
export function logCvDownload(matchId: string) {
  return supabase.rpc('log_cv_download', { p_match_id: matchId })
}

// ── Mutations ────────────────────────────────────────────────────────────────
/** Insert match_history audit rows (admin cold-start manual pairing; caller ignores the result by design). */
export function insertMatchHistory(rows: MatchHistoryInsert[]) {
  return supabase.from('match_history').insert(rows)
}

/** Patch a match row by id (status transitions etc.) — reused across HR/HM. */
export function updateMatch(matchId: string, patch: MatchUpdate) {
  return supabase.from('matches').update(patch).eq('id', matchId)
}

/** Patch many matches by id (bulk approve / status transitions — admin). */
export function updateMatches(matchIds: string[], patch: MatchUpdate) {
  return supabase.from('matches').update(patch).in('id', matchIds)
}

/** Insert match rows (admin cold-start). */
export function insertMatches(rows: MatchInsert[]) {
  return supabase.from('matches').insert(rows)
}
