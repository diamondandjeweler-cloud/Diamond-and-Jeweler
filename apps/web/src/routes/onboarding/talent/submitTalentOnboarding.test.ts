import { describe, it, expect } from 'vitest'
import { buildTalentInsert, type TalentOnboardingData, type TalentInsertResolved } from './submitTalentOnboarding'

// A representative, fully-filled onboarding form. Values are chosen so every
// conditional branch in buildTalentInsert is exercised (trimmed postcode,
// non-empty proficiency list, a set hard salary, mixed deal-breaker flags).
const filledData: TalentOnboardingData = {
  dob: '1990-06-15',
  gender: 'male',
  locationMatters: true,
  locationPostcode: ' 50450 ',
  openToNewField: true,
  apiMessages: [
    { role: 'assistant', content: 'Hi' },
    { role: 'user', content: 'Hello' },
  ],
  race: 'chinese',
  religion: 'buddhism',
  languages: ['english', 'mandarin'],
  dealBreakerItems: ['no night shifts'],
  minSalaryHard: 5000,
  noWeekendWork: true,
  noDrivingLicense: false,
  noTravel: true,
  noNightShifts: false,
  noOwnCar: false,
  remoteOnly: true,
  noRelocation: false,
  noOvertime: false,
  noCommissionOnly: true,
  skills: ['excel', 'sql'],
  languagesProficiency: [{ code: 'english', level: 'fluent' }],
  availableShifts: ['morning'],
  availableDaysPerWeek: 5,
  environmentPreferences: ['office'],
  candidateTypes: ['full_time'],
  priorityConcernsText: '  work-life balance  ',
  priorityConcernsAtoms: [{ type: 'concern', value: 'balance' }],
}

const resolved: TalentInsertResolved = {
  userId: 'user-123',
  dobEncrypted: '\\xDEADBEEF',
  photoPath: 'user-123/1700000000_photo.jpg',
}

describe('buildTalentInsert (golden payload)', () => {
  it('produces the exact talents Insert for a representative filled form', () => {
    const row = buildTalentInsert(filledData, resolved)

    expect(row).toEqual({
      profile_id: 'user-123',
      date_of_birth_encrypted: '\\xDEADBEEF',
      gender: 'male',
      // 1990-06-15 male → solar year 1990 → cycle slot 4 → 'W'
      life_chart_character: 'W',
      location_matters: true,
      location_postcode: '50450',
      open_to_new_field: true,
      interview_answers: {
        transcript: [
          { role: 'assistant', content: 'Hi' },
          { role: 'user', content: 'Hello' },
        ],
      },
      race: 'chinese',
      religion: 'buddhism',
      languages: ['english', 'mandarin'],
      uses_lunar_calendar: true,
      is_open_to_offers: false,
      extraction_status: 'pending',
      photo_url: 'user-123/1700000000_photo.jpg',
      deal_breakers: {
        items: ['no night shifts'],
        min_salary_hard: 5000,
        no_weekend_work: true,
        no_driving_license: false,
        no_travel: true,
        no_night_shifts: false,
        no_own_car: false,
        remote_only: true,
        no_relocation: false,
        no_overtime: false,
        no_commission_only: true,
      },
      skills: ['excel', 'sql'],
      languages_proficiency: [{ code: 'english', level: 'fluent' }],
      available_shifts: ['morning'],
      available_days_per_week: 5,
      environment_preferences: ['office'],
      candidate_types: ['full_time'],
      priority_concerns_text: 'work-life balance',
      priority_concerns_atoms: [{ type: 'concern', value: 'balance' }],
    })
  })

  it('always emits a string photo_url (NOT-NULL guarantee is structural)', () => {
    const row = buildTalentInsert(filledData, resolved)
    expect(typeof row.photo_url).toBe('string')

    // Even for an otherwise-empty form, photo_url mirrors the (non-null) path.
    const emptyData: TalentOnboardingData = {
      ...filledData,
      gender: '',
      locationMatters: null,
      locationPostcode: '',
      languages: [],
      languagesProficiency: [],
      availableDaysPerWeek: '',
      priorityConcernsText: '   ',
    }
    const emptyRow = buildTalentInsert(emptyData, { ...resolved, photoPath: 'p/x.jpg' })
    expect(typeof emptyRow.photo_url).toBe('string')
    expect(emptyRow.photo_url).toBe('p/x.jpg')
  })

  it('falls back to a conversational proficiency map when none is set', () => {
    const row = buildTalentInsert(
      { ...filledData, languagesProficiency: [], languages: ['english', 'mandarin'] },
      resolved,
    )
    expect(row.languages_proficiency).toEqual([
      { code: 'english', level: 'conversational' },
      { code: 'mandarin', level: 'conversational' },
    ])
  })

  it('nulls out gender/life-chart/postcode/concerns on an empty form', () => {
    const row = buildTalentInsert(
      {
        ...filledData,
        gender: '',
        locationMatters: null,
        locationPostcode: '',
        availableDaysPerWeek: '',
        priorityConcernsText: '   ',
      },
      resolved,
    )
    expect(row.gender).toBeNull()
    expect(row.life_chart_character).toBeNull()
    expect(row.location_matters).toBe(false)
    expect(row.location_postcode).toBeNull()
    expect(row.available_days_per_week).toBeNull()
    expect(row.priority_concerns_text).toBeNull()
  })
})
