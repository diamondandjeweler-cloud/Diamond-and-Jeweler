// Pure match-lifecycle domain module (domain layer — no React/router/Supabase
// imports; see the `src/shared/domain/**` purity rule in .eslintrc.cjs). The
// only import allowed here is the type-only `MatchStatus` union.
//
// The "active match" status set was historically defined TWICE (hm/types.ts and
// talent/types.ts) and re-inlined as DIVERGENT literal string arrays across the
// two dashboard hooks, CandidateCard, OfferCard and admin/KpiPanel. Several of
// those sets deliberately differ. This module is the single source of truth:
// every set below preserves its original membership AND order VERBATIM, and each
// deliberate divergence is documented at its declaration. The characterization
// suite in ./lifecycle.test.ts pins each set to the exact literal it replaced.

import type { MatchStatus } from '../../../types/db'

/**
 * The full "active match" set — a match still in play (i.e. not a terminal
 * declined / hired / expired state). Single source of truth for BOTH
 * dashboards' server-side `.in('status', …)` filter and the `isActiveMatch`
 * predicate.
 *
 * Membership + order are VERBATIM from the `ACTIVE` constant that lived —
 * byte-identical — in both routes/dashboard/hm/types.ts and
 * routes/dashboard/talent/types.ts. Those two files now re-export this as
 * `ACTIVE`, so existing `import { ACTIVE } from './types'` sites keep working.
 */
export const ACTIVE_MATCH_STATUSES: readonly MatchStatus[] = [
  'generated', 'viewed', 'accepted_by_talent',
  'invited_by_manager', 'hr_scheduling',
  'interview_scheduled', 'interview_completed',
  'offer_made',
]

/**
 * Per-role active-tally set. DELIBERATE DIVERGENCE from ACTIVE_MATCH_STATUSES:
 * it OMITS 'offer_made'. Used only by the HM dashboard's per-role active-count
 * query (`activeMatchRoleIds`) — once an offer is out the match no longer
 * counts against the role's live-match tally. Verbatim from the `activeRows`
 * literal in useHmDashboardData.
 */
export const ACTIVE_MATCH_STATUSES_FOR_ROLE_TALLY: readonly MatchStatus[] = [
  'generated', 'viewed', 'accepted_by_talent',
  'invited_by_manager', 'hr_scheduling',
  'interview_scheduled', 'interview_completed',
]

/**
 * Statuses where the hiring manager owes the next move — the candidate is newly
 * surfaced or talent-accepted and awaiting an invite-or-decline. Drives the HM
 * "action needed" KPI, the dashboard cache aggregate, and CandidateCard's
 * stage-1 action row. Verbatim from the ['generated','viewed',
 * 'accepted_by_talent'] literals in useHmDashboardData + CandidateCard.
 */
export const HM_ACTION_NEEDED_STATUSES: readonly MatchStatus[] = [
  'generated', 'viewed', 'accepted_by_talent',
]

/**
 * Interview-stage set — matches with an active interview lifecycle whose rounds
 * / proposals should be loaded. DELIBERATE DIVERGENCE from ACTIVE_MATCH_STATUSES:
 * it OMITS 'hr_scheduling' (an internal HR pre-scheduling limbo with no rounds
 * yet). Shared verbatim by BOTH hooks' `interviewMatchIds` filter.
 */
export const INTERVIEW_STAGE_STATUSES: readonly MatchStatus[] = [
  'invited_by_manager', 'interview_scheduled', 'interview_completed', 'offer_made',
]

/**
 * "Open" offers from the talent's perspective — a brand-new match the talent has
 * not yet accepted or declined. Its complement (NOT open) is the talent
 * "in-flight" bucket. Drives the talent KPI counts and OfferCard's stage-1
 * accept/decline row. Verbatim from the ['generated','viewed'] literals in
 * useTalentDashboardData + OfferCard.
 */
export const TALENT_OPEN_STATUSES: readonly MatchStatus[] = [
  'generated', 'viewed',
]

/**
 * Admin KPI "matches by status" table rows. DELIBERATE DIVERGENCE: a SUPERSET of
 * the active set that also lists terminal states (declined_by_talent,
 * declined_by_manager, hired, expired) BUT OMITS 'offer_made' (no admin row was
 * ever rendered for it). Membership AND order are verbatim from the
 * `TRACKED_STATUSES` array in admin/KpiPanel — the table renders one row per
 * entry in this exact order, so order is load-bearing.
 */
export const ADMIN_TRACKED_STATUSES: readonly MatchStatus[] = [
  'generated', 'viewed', 'accepted_by_talent', 'declined_by_talent',
  'invited_by_manager', 'declined_by_manager', 'hr_scheduling',
  'interview_scheduled', 'interview_completed', 'hired', 'expired',
]

/** True when the match is still in play (any ACTIVE_MATCH_STATUSES member). */
export function isActiveMatch(status: string): boolean {
  return (ACTIVE_MATCH_STATUSES as readonly string[]).includes(status)
}

/** True when the hiring manager owes the next action on this match. */
export function needsHmAction(status: string): boolean {
  return (HM_ACTION_NEEDED_STATUSES as readonly string[]).includes(status)
}

/** True for a brand-new offer the talent has not yet accepted or declined. */
export function isTalentOpen(status: string): boolean {
  return (TALENT_OPEN_STATUSES as readonly string[]).includes(status)
}

/** True for a match in the interview lifecycle (rounds/proposals loadable). */
export function isInterviewStage(status: string): boolean {
  return (INTERVIEW_STAGE_STATUSES as readonly string[]).includes(status)
}

/**
 * The intermediate statuses that MUST be written (in order) before a match may
 * legally transition from `from` to `to`.
 *
 * The HM state machine requires generated → viewed before viewed →
 * invited_by_manager or viewed → declined_by_manager, so acting on a still-
 * 'generated' match must advance through 'viewed' first — regardless of which
 * terminal action the HM picks.
 *
 * Byte-equivalent to the inline `if (prevStatus === 'generated')` guard in
 * useHmDashboardData.respond(): returns `['viewed']` iff `from` is 'generated',
 * otherwise `[]`. `to` is part of the transition contract (and constrains the
 * caller to the two legal targets) but does not change today's single-rule
 * result — both targets share the same 'viewed' prerequisite.
 */
export function precedingStatuses(
  from: string | undefined,
  _to: 'invited_by_manager' | 'declined_by_manager',
): MatchStatus[] {
  return from === 'generated' ? ['viewed'] : []
}
