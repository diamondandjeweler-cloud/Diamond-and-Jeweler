import type { PublicReasoning } from '../../../types/db'

/** Cached snapshot — counts only. The full match details (scores, IDs) are
 *  refetched fresh every visit to keep PDPA exposure surface minimal. */
export interface TalentCacheSnapshot {
  matchesCount: number
  openCount: number
  inFlightCount: number
}

export interface MatchRow {
  id: string
  compatibility_score: number | null
  status: string
  expires_at: string | null
  public_reasoning: PublicReasoning | null
  application_summary: string | null
  roles: { id: string; title: string; description: string | null; salary_min: number | null; salary_max: number | null; location: string | null; work_arrangement: string | null; employment_type?: string; hourly_rate?: number | null; duration_days?: number | null } | null
}

export interface TalentFeedbackEntry {
  rating: number
  outcome: string
  freeText: string
  saving: boolean
  saved: boolean
  pointsAwarded?: number
}

export const ACTIVE = [
  'generated', 'viewed', 'accepted_by_talent',
  'invited_by_manager', 'hr_scheduling',
  'interview_scheduled', 'interview_completed',
  'offer_made',
]

export const TALENT_OUTCOME_KEYS: { value: string; emoji: string; tKey: string }[] = [
  { value: '',                  emoji: '',    tKey: 'talentDash.outcomeSelect' },
  { value: 'accepted_offer',    emoji: '✅ ', tKey: 'talentDash.outcomeAccepted' },
  { value: 'offer_declined',    emoji: '❌ ', tKey: 'talentDash.outcomeDeclined' },
  { value: 'company_ghosted',   emoji: '👻 ', tKey: 'talentDash.outcomeGhosted' },
  { value: 'passed_probation',  emoji: '🏆 ', tKey: 'talentDash.outcomePassedProbation' },
  { value: 'failed_probation',  emoji: '⚠️ ', tKey: 'talentDash.outcomeFailedProbation' },
  { value: 'still_employed_6m', emoji: '📅 ', tKey: 'talentDash.outcomeEmployed6m' },
  { value: 'still_employed_1y', emoji: '🎉 ', tKey: 'talentDash.outcomeEmployed1y' },
]

/**
 * Derives the list of profile-completeness gap i18n keys from a raw talents row.
 * Pure — no React, no Supabase. Pushes i18n keys (not raw English) so
 * ProfileCompletenessBar runs each through t() and the chips localise.
 *
 * Extracted verbatim from the dashboard load effect so the gating order and the
 * exact field checks are preserved; unit-tested in TalentDashboard.test.tsx.
 */
export function computeProfileGaps(t2: Record<string, unknown>): string[] {
  const gaps: string[] = []
  if (!t2.current_employment_status)                gaps.push('talentDash.gapEmploymentStatus')
  if (t2.current_salary == null)                    gaps.push('talentDash.gapCurrentSalary')
  if (!t2.education_level)                          gaps.push('talentDash.gapEducationLevel')
  if (!t2.work_authorization)                       gaps.push('talentDash.gapWorkAuthorization')
  if (t2.expected_salary_min == null)               gaps.push('talentDash.gapExpectedSalary')
  if (!Array.isArray(t2.employment_type_preferences) || (t2.employment_type_preferences as unknown[]).length === 0)
                                                    gaps.push('talentDash.gapEmploymentType')
  if (!t2.preferred_management_style)               gaps.push('talentDash.gapManagementStyle')
  if (!t2.career_goal_horizon)                      gaps.push('talentDash.gapCareerGoal')
  if (!t2.job_intention)                            gaps.push('talentDash.gapLongTermIntention')
  if (t2.has_noncompete == null)                    gaps.push('talentDash.gapNonCompete')
  if (!t2.salary_structure_preference)              gaps.push('talentDash.gapSalaryStructure')
  if (t2.notice_period_days == null)                gaps.push('talentDash.gapNoticePeriod')
  return gaps
}
