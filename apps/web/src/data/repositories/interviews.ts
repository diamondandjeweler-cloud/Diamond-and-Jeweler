import { supabase } from '../../lib/supabase'

// ── Interviews, rounds, proposals, feedback ──────────────────────────────────
// Completes write-centralization across the recruitment-core tables (matches,
// roles, interviews) plus the interview_rounds / interview_proposals /
// feedback_submissions reads and writes. The HM and talent proposal
// projections legitimately differ (the HM sees decline_reason; the talent does
// not — PDPA column isolation), so they stay two distinct functions: NEVER
// unify them. Functions return the query BUILDER; callers keep their own
// await / .then / terminal operators.

/** Patch an interview row by id (e.g. mark completed). */
export function updateInterview(interviewId: string, patch: Record<string, unknown>) {
  return supabase.from('interviews').update(patch).eq('id', interviewId)
}

/** Insert an interview row (HR schedules an interview). */
export function insertInterview(row: Record<string, unknown>) {
  return supabase.from('interviews').insert(row)
}

/** Interview rounds for a set of matches, ordered by round number (identical projection on HM + talent dashboards). */
export function interviewRoundsForMatches(matchIds: string[]) {
  return supabase
    .from('interview_rounds')
    .select('id, match_id, round_number, scheduled_at, interview_url, status')
    .in('match_id', matchIds)
    .order('round_number', { ascending: true })
}

/** Interview proposals for the HM dashboard — projection INCLUDES decline_reason (talent variant must not). */
export function hmInterviewProposalsForMatches(matchIds: string[]) {
  return supabase
    .from('interview_proposals')
    .select('id, match_id, round_number, slot_1_at, slot_2_at, slot_3_at, status, picked_slot, decline_reason, created_at')
    .in('match_id', matchIds)
    .order('created_at', { ascending: false })
}

/** Interview proposals for the talent dashboard — projection deliberately LACKS decline_reason (PDPA column isolation). */
export function talentInterviewProposalsForMatches(matchIds: string[]) {
  return supabase
    .from('interview_proposals')
    .select('id, match_id, round_number, slot_1_at, slot_2_at, slot_3_at, status, picked_slot, created_at')
    .in('match_id', matchIds)
    .order('created_at', { ascending: false })
}

/** Scheduled/confirmed interviews (joined to matches + roles) for the HR dashboard, scoped by the company's role ids. */
export function hrScheduledInterviewsForRoles(roleIds: string[]) {
  return supabase.from('interviews')
    .select('id, scheduled_at, format, status, match_id, meeting_url, meeting_provider, matches!inner(role_id, talent_id, roles(title))')
    .in('matches.role_id', roleIds).in('status', ['scheduled', 'confirmed'])
    .order('scheduled_at', { ascending: true })
}

/** Feedback flags on a match's interview row (InterviewFeedback resolver; caller adds .maybeSingle()). */
export function interviewFeedbackFlagsByMatch(matchId: string) {
  return supabase
    .from('interviews').select('id, feedback_talent, feedback_manager').eq('match_id', matchId)
}

/** Insert a feedback_submissions row — caller inspects error.code === '23505' for idempotency. */
export function insertFeedbackSubmission(row: {
  match_id: string
  from_user_id: string
  rating: number
  comment: string | null
}) {
  return supabase.from('feedback_submissions').insert(row)
}
