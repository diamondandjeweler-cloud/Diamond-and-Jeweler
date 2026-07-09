import { describe, it, expect } from 'vitest'
import { buildHmUpdate, type ExtractedHmProfile, type HmOnboardingData } from './submitHmOnboarding'

// A representative extract-hm-profile response with every field populated.
const extracted: ExtractedHmProfile = {
  industry: 'tech',
  role_type: 'Backend Engineer',
  role_open_reason: 'growth',
  why_last_hire_left: 'relocated',
  team_size: 8,
  hire_urgency: 'high',
  success_at_90_days: 'ships features',
  failure_at_90_days: 'misses deadlines',
  failure_pattern: 'poor communication',
  hardest_part_of_role: 'legacy code',
  work_arrangement_offered: 'hybrid',
  must_have_items: ['golang', 'postgres'],
  screening_red_flags: ['job hopping'],
  leadership_tags: { mentoring: 3 },
  required_traits: ['ownership'],
  culture_offers: { autonomy: 5 },
  salary_offer_min: 8000,
  salary_offer_max: 12000,
  career_growth_potential: 'high',
  interview_stages: 3,
  panel_involved: true,
  required_work_authorization: ['citizen'],
  summary: 'Strong backend role',
}

// Representative filled form. failureAt90Days / interviewRoundsHM are set so the
// form-value-over-extracted precedence branches are exercised, and the postcode
// carries surrounding whitespace to exercise the trim.
const form: HmOnboardingData = {
  dob: '1985-03-20',
  dobEncrypted: '\\xCAFE',
  gender: 'female',
  jobTitle: '  Engineering Manager  ',
  failureAt90Days: '  cannot ship  ',
  salaryFlex: true,
  interviewRoundsHM: 2,
  mustHaveItems: ['leadership'],
  race: 'malay',
  religion: 'islam',
  languages: ['english', 'malay'],
  locationMatters: true,
  locationPostcode: ' 50000 ',
  budgetApproved: 'yes',
  deadlineToFill: '2026-08-01',
  hmRequiresDrivingLicense: false,
  hmRequiresWeekends: true,
  hmRequiresTravel: false,
  hmRequiresNightShifts: false,
  hmRequiresRelocation: false,
  hmOnsiteOnly: true,
  hmRequiresOwnTransport: false,
  hmHasCommission: false,
  apiMessages: [
    { role: 'assistant', content: 'Hi' },
    { role: 'user', content: 'Hello' },
  ],
}

describe('buildHmUpdate (golden payload)', () => {
  it('produces the exact hiring_managers Update for a representative filled form', () => {
    const row = buildHmUpdate(extracted, form)

    expect(row).toEqual({
      date_of_birth_encrypted: '\\xCAFE',
      gender: 'female',
      // 1985-03-20 female → solar year 1985 → cycle slot 8 → 'F'
      life_chart_character: 'F',
      job_title: 'Engineering Manager',
      industry: 'tech',
      role_type: 'Backend Engineer',
      role_open_reason: 'growth',
      why_last_hire_left: 'relocated',
      team_size: 8,
      hire_urgency: 'high',
      success_at_90_days: 'ships features',
      // form value wins over extracted.failure_at_90_days
      failure_at_90_days: 'cannot ship',
      screening_red_flags: ['job hopping', 'Failure pattern: poor communication'],
      hardest_part_of_role: 'legacy code',
      work_arrangement_offered: 'hybrid',
      leadership_tags: { mentoring: 3 },
      required_traits: ['ownership'],
      culture_offers: { autonomy: 5 },
      salary_offer_min: 8000,
      salary_offer_max: 12000,
      salary_flex: true,
      ai_summary: 'Strong backend role',
      interview_answers: {
        transcript: [
          { role: 'assistant', content: 'Hi' },
          { role: 'user', content: 'Hello' },
        ],
      },
      must_haves: { items: ['leadership'] },
      // extracted list is non-empty → wins
      must_have_items: ['golang', 'postgres'],
      career_growth_potential: 'high',
      // form interview rounds win over extracted.interview_stages
      interview_stages: 2,
      panel_involved: true,
      required_work_authorization: ['citizen'],
      race: 'malay',
      religion: 'islam',
      languages: ['english', 'malay'],
      location_matters: true,
      location_postcode: '50000',
      budget_approved: 'yes',
      deadline_to_fill: '2026-08-01',
      role_constraints: {
        requires_driving_license: false,
        requires_weekends: true,
        requires_travel: false,
        requires_night_shifts: false,
        requires_relocation: false,
        onsite_only: true,
        requires_own_transport: false,
        has_commission: false,
      },
    })
  })

  it('nulls out screening_red_flags when neither red flags nor a failure pattern exist', () => {
    const row = buildHmUpdate(
      { ...extracted, screening_red_flags: [], failure_pattern: null },
      form,
    )
    expect(row.screening_red_flags).toBeNull()
  })

  it('falls back to extracted values and form must-haves when form fields are empty', () => {
    const row = buildHmUpdate(
      { ...extracted, must_have_items: [] },
      { ...form, failureAt90Days: '   ', interviewRoundsHM: null, dobEncrypted: null, gender: '' },
    )
    // extracted failure description used when the form field is blank
    expect(row.failure_at_90_days).toBe('misses deadlines')
    // extracted stages used when the form rounds are null
    expect(row.interview_stages).toBe(3)
    // form must-haves used when extracted list is empty
    expect(row.must_have_items).toEqual(['leadership'])
    // no DOB / gender → no life-chart character, null encrypted DOB
    expect(row.life_chart_character).toBeNull()
    expect(row.date_of_birth_encrypted).toBeNull()
    expect(row.gender).toBeNull()
  })

  it('nulls languages and postcode when empty / location does not matter', () => {
    const row = buildHmUpdate(extracted, {
      ...form,
      languages: [],
      locationMatters: false,
      locationPostcode: '',
    })
    expect(row.languages).toBeNull()
    expect(row.location_matters).toBe(false)
    expect(row.location_postcode).toBeNull()
  })
})
