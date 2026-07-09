import type { PublicReasoning } from '../../../types/db'

type TFn = (key: string, opts?: Record<string, unknown>) => string

/** HM dashboard KPI snapshot — safe-to-cache aggregates only. */
export interface HMCacheSnapshot {
  roleCount: number
  candidatesCount: number
  actionNeededCount: number
  hiredAllTime: number
}

export const hmOutcomes = (t: TFn) => [
  { value: '', label: t('hmDash.outcomeSelect') },
  { value: 'great_hire',       label: t('hmDash.outcomeGreatHire') },
  { value: 'good_interview',   label: t('hmDash.outcomeGoodInterview') },
  { value: 'offer_declined',   label: t('hmDash.outcomeOfferDeclined') },
  { value: 'hired_left_early', label: t('hmDash.outcomeLeftEarly') },
  { value: 'poor_interview',   label: t('hmDash.outcomePoorInterview') },
  { value: 'no_show',          label: t('hmDash.outcomeNoShow') },
]

export interface CandidateRow {
  id: string
  compatibility_score: number | null
  status: string
  is_urgent?: boolean | null
  public_reasoning: PublicReasoning | null
  application_summary: string | null
  talents: {
    id: string
    privacy_mode: string
    derived_tags: Record<string, number> | null
    expected_salary_min: number | null
    expected_salary_max: number | null
  } | null
  roles: { id: string; title: string } | null
  match_feedback: { rating: number; hired: boolean; notes: string | null }[] | null
}

export interface ProfilePreview {
  display_name: string | null
  photo_url: string | null
  privacy_mode: string | null
}

export interface ContactInfo {
  full_name: string
  email: string
  phone: string | null
}

export interface WaitingInfo { roleCount: number; estimatedDays: number }
export interface RoleExtraInfo { id: string; title: string; activeCount: number; extraUsed: number }

export interface HmReputation {
  reputation_score: number | null
  feedback_volume: number
  phs_offer_accept_rate: number | null
  hm_quality_factor: number | null
  hm_cancel_rate: number | null
}

export interface FeedbackEntry {
  rating: number
  hired: boolean
  notes: string
  outcome: string
  freeText: string
  saving: boolean
  saved: boolean
  pointsAwarded?: number
}

// The active-match set lives in the pure domain module (single source of truth).
// Re-exported under the historical `ACTIVE` name so existing importers are unchanged.
export { ACTIVE_MATCH_STATUSES as ACTIVE } from '../../../shared/domain/match/lifecycle'
