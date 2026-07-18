/** Shared types for the HR dashboard (scheduling tab + link-HMs tab).
 *  Relocated verbatim from HRDashboard.tsx — no shape changes. */

/** Snapshot of structural data that's safe to cache cross-session. Excludes
 *  candidate-level identifiers and match scores (PDPA-sensitive). */
export interface HRCacheSnapshot {
  companyId: string | null
  outcomesPending: number
  hms: HMRow[]
  openRoles: OpenRoleRow[]
}

export interface PendingRow {
  id: string
  status: string
  compatibility_score: number | null
  roles: { id: string; title: string } | null
  talents: { id: string; profile_id: string } | null
}

export interface ScheduledRow {
  match_id: string
  interview_id: string
  status: string
  scheduled_at: string | null
  format: string | null
  role_title: string
  talent_id: string
  meeting_url: string | null
  meeting_provider: string | null
}

export interface HMRow {
  id: string
  profile_id: string
  full_name: string
  job_title: string
  role_count: number
  is_self: boolean
}

export interface OpenRoleRow {
  id: string
  title: string
  hm_name: string
}

export type HRTab = 'scheduling' | 'link-hms'

/** Shape returned by the `hr_dashboard_bootstrap(p_email)` RPC (migration 0195).
 *  Note: pending uses singular `role`/`talent` — the client adapts them to the
 *  plural `roles`/`talents` that PendingRow (and SchedulingSection) expect. */
export interface HrBootstrap {
  company: { id: string } | null
  hms: Array<{ id: string; profile_id: string; full_name: string; job_title: string; role_count: number }>
  open_roles: Array<{ id: string; title: string; hiring_manager_id: string }>
  pending: Array<{
    id: string
    status: string
    compatibility_score: number | null
    role: { id: string; title: string } | null
    talent: { id: string; profile_id: string } | null
  }>
  scheduled: Array<{
    interview_id: string
    match_id: string
    status: string
    scheduled_at: string | null
    format: string | null
    meeting_url: string | null
    meeting_provider: string | null
    role_title: string
    talent_id: string
  }>
  outcomes_pending: number
}
