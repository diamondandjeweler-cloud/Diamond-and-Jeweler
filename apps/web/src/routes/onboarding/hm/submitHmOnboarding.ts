/**
 * Pure builder for the hiring_managers update payload emitted at the end of HM
 * onboarding.
 *
 * Extracted verbatim from HMOnboarding.finalise() as a behavior-preserving
 * decomposition so the row construction is golden-testable in isolation. No
 * runtime logic changed: the same getLifeChartCharacter call, the same
 * form-value-over-extracted precedence, and the same null-coalescing are
 * reproduced exactly.
 *
 * This replaces the blanket `as unknown as HmUpdate` cast that previously
 * wrapped the whole inline object. The only field that genuinely needs a Json
 * boundary cast is interview_answers (an interface-typed ApiMessage[] that TS
 * won't accept as Json because interfaces lack an index signature); the other
 * jsonb columns are structurally valid JSON. Casting just that value keeps the
 * builder's return type honestly `HmUpdate`.
 */
import type { Database, Json } from '../../../types/db.generated'
import { getLifeChartCharacter, type Gender } from '../../../shared/domain/lifeChart/lifeChartCharacter'
import type { ApiMessage } from './helpers'

type HmUpdate = Database['public']['Tables']['hiring_managers']['Update']

/**
 * Shape of the extract-hm-profile Edge Function response. Declared once here and
 * reused at the call site for the fetch `.json()` cast.
 */
export interface ExtractedHmProfile {
  error?: string
  industry: string | null
  role_type: string | null
  role_open_reason: string | null
  why_last_hire_left: string | null
  team_size: number | null
  hire_urgency: string | null
  success_at_90_days: string | null
  failure_at_90_days: string | null
  failure_pattern: string | null
  hardest_part_of_role: string | null
  work_arrangement_offered: string | null
  must_have_items: string[]
  screening_red_flags: string[]
  leadership_tags: Record<string, number>
  required_traits: string[]
  culture_offers: Record<string, number>
  salary_offer_min: number | null
  salary_offer_max: number | null
  career_growth_potential: string | null
  interview_stages: number | null
  panel_involved: boolean | null
  required_work_authorization: string[]
  summary: string | null
}

/**
 * Every HM-onboarding form value persisted to the hiring_managers row, declared
 * once. `dobEncrypted` is resolved asynchronously in finalise() (null when the
 * HM skips DOB). A thin adapter over the wizard's useState values.
 */
export interface HmOnboardingData {
  dob: string
  dobEncrypted: string | null
  gender: Gender | ''
  jobTitle: string
  failureAt90Days: string
  salaryFlex: boolean | null
  interviewRoundsHM: number | null
  mustHaveItems: string[]
  race: string
  religion: string
  languages: string[]
  locationMatters: boolean | null
  locationPostcode: string
  budgetApproved: string
  deadlineToFill: string
  hmRequiresDrivingLicense: boolean
  hmRequiresWeekends: boolean
  hmRequiresTravel: boolean
  hmRequiresNightShifts: boolean
  hmRequiresRelocation: boolean
  hmOnsiteOnly: boolean
  hmRequiresOwnTransport: boolean
  hmHasCommission: boolean
  apiMessages: ApiMessage[]
}

/**
 * Build the exact hiring_managers Update payload from the extracted AI profile
 * plus the structured form state. Pure and deterministic — the only non-input
 * dependency is getLifeChartCharacter (itself a pure lookup).
 */
export function buildHmUpdate(extracted: ExtractedHmProfile, form: HmOnboardingData): HmUpdate {
  const lifeChartCharacter = form.gender ? getLifeChartCharacter(form.dob, form.gender) : null

  return {
    date_of_birth_encrypted: form.dobEncrypted,
    gender: form.gender || null,
    life_chart_character: lifeChartCharacter,
    job_title: form.jobTitle.trim(),
    industry: extracted.industry,
    role_type: extracted.role_type,
    role_open_reason: extracted.role_open_reason ?? null,
    why_last_hire_left: extracted.why_last_hire_left ?? null,
    team_size: extracted.team_size ?? null,
    hire_urgency: extracted.hire_urgency ?? null,
    success_at_90_days: extracted.success_at_90_days ?? null,
    // Form value takes precedence over chat-extracted failure description
    failure_at_90_days: form.failureAt90Days.trim() || extracted.failure_at_90_days || null,
    screening_red_flags: [
      ...(extracted.screening_red_flags ?? []),
      ...(extracted.failure_pattern ? [`Failure pattern: ${extracted.failure_pattern}`] : []),
    ].filter(Boolean).length > 0
      ? [
          ...(extracted.screening_red_flags ?? []),
          ...(extracted.failure_pattern ? [`Failure pattern: ${extracted.failure_pattern}`] : []),
        ].filter(Boolean)
      : null,
    hardest_part_of_role: extracted.hardest_part_of_role ?? null,
    work_arrangement_offered: extracted.work_arrangement_offered ?? null,
    leadership_tags: extracted.leadership_tags,
    required_traits: extracted.required_traits,
    culture_offers: extracted.culture_offers,
    salary_offer_min: extracted.salary_offer_min,
    salary_offer_max: extracted.salary_offer_max,
    salary_flex: form.salaryFlex,
    ai_summary: extracted.summary,
    // ApiMessage[] wrapped in a plain object — valid JSON; interface lacks an
    // index signature so TS needs a boundary cast (no runtime change).
    interview_answers: { transcript: form.apiMessages } as unknown as Json,
    must_haves: { items: form.mustHaveItems },
    must_have_items: extracted.must_have_items?.length ? extracted.must_have_items : (form.mustHaveItems.length ? form.mustHaveItems : null),
    career_growth_potential: extracted.career_growth_potential ?? null,
    // Form value takes precedence over chat-extracted interview stages
    interview_stages: form.interviewRoundsHM ?? extracted.interview_stages ?? null,
    panel_involved: extracted.panel_involved ?? null,
    required_work_authorization: extracted.required_work_authorization?.length ? extracted.required_work_authorization : null,
    // Demographics (new)
    race: form.race || null,
    religion: form.religion || null,
    languages: form.languages.length > 0 ? form.languages : null,
    location_matters: form.locationMatters === true,
    location_postcode: form.locationMatters && form.locationPostcode.trim() ? form.locationPostcode.trim() : null,
    // Hiring process details (new)
    budget_approved: form.budgetApproved || null,
    deadline_to_fill: form.deadlineToFill || null,
    // Role operational constraints (new) — mirrors talent deal_breakers structure
    role_constraints: {
      requires_driving_license: form.hmRequiresDrivingLicense,
      requires_weekends: form.hmRequiresWeekends,
      requires_travel: form.hmRequiresTravel,
      requires_night_shifts: form.hmRequiresNightShifts,
      requires_relocation: form.hmRequiresRelocation,
      onsite_only: form.hmOnsiteOnly,
      requires_own_transport: form.hmRequiresOwnTransport,
      has_commission: form.hmHasCommission,
    },
  }
}
