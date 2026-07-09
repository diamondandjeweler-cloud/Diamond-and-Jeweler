/**
 * Pure builder for the talents upsert payload emitted at the end of Talent
 * onboarding.
 *
 * Extracted verbatim from TalentOnboarding.finalise() as a behavior-preserving
 * decomposition so the row construction is golden-testable in isolation. No
 * runtime logic changed: the same computeUsesLunarCalendar / getLifeChartCharacter
 * calls, the same Json boundary casts, and the same null-coalescing are reproduced
 * exactly.
 *
 * The one structural change is that `photoPath` is typed `string` (not
 * `string | null`). photo_url is NOT NULL in the talents schema; the caller now
 * guards a present photo before uploading, so photo_url can never receive null.
 * That closes the previously self-flagged LATENT RISK where `photo_url:
 * photoPath as string` masked a potential NOT-NULL violation on the (unreachable)
 * no-photo path.
 */
import type { Database, Json } from '../../../types/db.generated'
import { getLifeChartCharacter, type Gender } from '../../../shared/domain/lifeChart/lifeChartCharacter'
import type { LanguageReq, NNAtom } from '../../../components/role-form'
import { computeUsesLunarCalendar, type ApiMessage } from './helpers'

type TalentInsert = Database['public']['Tables']['talents']['Insert']

/**
 * Every talent-onboarding field that is persisted to the talents row, declared
 * once. A thin adapter over the wizard's useState values — see
 * TalentOnboarding.finalise().
 */
export interface TalentOnboardingData {
  dob: string
  gender: Gender | ''
  locationMatters: boolean | null
  locationPostcode: string
  openToNewField: boolean
  apiMessages: ApiMessage[]
  race: string
  religion: string
  languages: string[]
  dealBreakerItems: string[]
  minSalaryHard: number | null
  noWeekendWork: boolean
  noDrivingLicense: boolean
  noTravel: boolean
  noNightShifts: boolean
  noOwnCar: boolean
  remoteOnly: boolean
  noRelocation: boolean
  noOvertime: boolean
  noCommissionOnly: boolean
  skills: string[]
  languagesProficiency: LanguageReq[]
  availableShifts: string[]
  availableDaysPerWeek: number | ''
  environmentPreferences: string[]
  candidateTypes: string[]
  priorityConcernsText: string
  priorityConcernsAtoms: NNAtom[]
}

/**
 * Values resolved asynchronously in finalise() before the row is built: the
 * owning profile id, the encrypted DOB, and the uploaded photo's storage path.
 * `photoPath` is `string` (never null) — the docs guard guarantees a photo.
 */
export interface TalentInsertResolved {
  userId: string
  dobEncrypted: string
  photoPath: string
}

/**
 * Build the exact talents Insert payload. Pure and deterministic — the only
 * non-input dependency is getLifeChartCharacter (itself a pure lookup).
 */
export function buildTalentInsert(
  data: TalentOnboardingData,
  resolved: TalentInsertResolved,
): TalentInsert {
  const { gender } = data
  const lifeChartCharacter = gender
    ? getLifeChartCharacter(data.dob, gender)
    : null

  return {
    profile_id: resolved.userId,
    date_of_birth_encrypted: resolved.dobEncrypted,
    gender: gender || null,
    life_chart_character: lifeChartCharacter,
    location_matters: data.locationMatters === true,
    location_postcode: data.locationMatters && data.locationPostcode.trim() ? data.locationPostcode.trim() : null,
    open_to_new_field: data.openToNewField,
    // ApiMessage[] wrapped in a plain object — valid JSON; interface lacks an
    // index signature so TS needs a boundary cast (no runtime change).
    interview_answers: { transcript: data.apiMessages } as unknown as Json,
    race: data.race || null,
    religion: data.religion || null,
    languages: data.languages,
    uses_lunar_calendar: computeUsesLunarCalendar(data.race, data.religion, data.languages),
    is_open_to_offers: false,
    extraction_status: 'pending',
    // photo_url is NOT NULL in the talents schema; photoPath is `string` (the
    // docs guard in finalise() guarantees a photo), so it can never be null.
    photo_url: resolved.photoPath,
    deal_breakers: {
      items: data.dealBreakerItems,
      min_salary_hard: data.minSalaryHard,
      no_weekend_work: data.noWeekendWork,
      no_driving_license: data.noDrivingLicense,
      no_travel: data.noTravel,
      no_night_shifts: data.noNightShifts,
      no_own_car: data.noOwnCar,
      remote_only: data.remoteOnly,
      no_relocation: data.noRelocation,
      no_overtime: data.noOvertime,
      no_commission_only: data.noCommissionOnly,
    },
    // ── 0112 structured matching extras ───────────────────────────────
    skills: data.skills,
    // LanguageReq[] is valid JSON; interface lacks an index signature so TS
    // needs a boundary cast (no runtime change).
    languages_proficiency: (data.languagesProficiency.length > 0
      ? data.languagesProficiency
      : data.languages.map((code) => ({ code, level: 'conversational' as const }))) as unknown as Json,
    available_shifts: data.availableShifts,
    available_days_per_week: data.availableDaysPerWeek === '' ? null : data.availableDaysPerWeek,
    environment_preferences: data.environmentPreferences,
    candidate_types: data.candidateTypes,
    priority_concerns_text: data.priorityConcernsText.trim() || null,
    // NNAtom[] is valid JSON; interface lacks an index signature so TS needs a
    // boundary cast (no runtime change).
    priority_concerns_atoms: data.priorityConcernsAtoms as unknown as Json,
  }
}
