/**
 * Life-chart character lookup.
 *
 * Assigns one of nine character codes (E, W, E-, W-, E+, W+, F, G+, G-)
 * based on the user's date of birth and gender. The "year" used for the
 * lookup follows the solar-year boundary (Li Chun, around 3-5 February),
 * NOT the calendar year — see START_DAY_FEB for the exact day per year.
 *
 * Used by both Talent and HM onboarding to populate
 * talents.life_chart_character and hiring_managers.life_chart_character.
 *
 * Supported range: solar years 1950 through 2100 inclusive.
 */

export type Gender = 'male' | 'female'

export type LifeChartCharacter =
  | 'E' | 'W' | 'F'
  | 'E+' | 'E-'
  | 'W+' | 'W-'
  | 'G+' | 'G-'

// [male, female] indexed by ((chineseYear - 1950) mod 9).
const CYCLE: ReadonlyArray<readonly [LifeChartCharacter, LifeChartCharacter]> = [
  ['E',  'W' ],   // 0
  ['W-', 'E-'],   // 1
  ['W+', 'W+'],   // 2
  ['E-', 'W-'],   // 3
  ['W',  'E' ],   // 4
  ['F',  'G+'],   // 5
  ['E+', 'G-'],   // 6
  ['G-', 'E+'],   // 7
  ['G+', 'F' ],   // 8
]

// Day of February (3, 4, or 5) on which each solar year begins.
// Indexed from 1950. Last entry is 2100.
const START_DAY_FEB: readonly number[] = [
  // 1950-1959
  4, 4, 5, 4, 4, 4, 5, 4, 4, 4,
  // 1960-1969
  5, 4, 4, 4, 5, 4, 4, 4, 5, 4,
  // 1970-1979
  4, 4, 5, 4, 4, 4, 5, 4, 4, 4,
  // 1980-1989
  5, 4, 4, 4, 5, 4, 4, 4, 5, 4,
  // 1990-1999
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  // 2000-2009
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  // 2010-2019
  4, 4, 4, 4, 4, 4, 4, 3, 4, 4,
  // 2020-2029
  4, 3, 4, 4, 4, 3, 4, 4, 4, 3,
  // 2030-2039
  4, 4, 4, 3, 4, 4, 4, 3, 4, 4,
  // 2040-2049
  4, 3, 4, 4, 4, 3, 4, 4, 4, 3,
  // 2050-2059
  3, 4, 4, 3, 4, 4, 4, 3, 4, 4,
  // 2060-2069
  4, 3, 4, 4, 4, 3, 3, 4, 4, 3,
  // 2070-2079
  4, 4, 4, 3, 4, 4, 4, 3, 4, 4,
  // 2080-2089
  4, 3, 4, 4, 4, 3, 4, 4, 4, 3,
  // 2090-2099
  4, 4, 4, 3, 4, 4, 4, 3, 4, 4,
  // 2100
  4,
]

export const MIN_YEAR = 1950
export const MAX_YEAR = 2100

/**
 * Returns the solar year a calendar date belongs to. January is always the
 * previous solar year. February depends on the year's boundary day — a date
 * before the boundary belongs to the previous solar year.
 */
function chineseYearForDate(d: Date): number {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (m < 2) return y - 1
  if (m > 2) return y
  const idx = y - MIN_YEAR
  const boundary = idx >= 0 && idx < START_DAY_FEB.length ? START_DAY_FEB[idx] : 4
  return d.getDate() < boundary ? y - 1 : y
}

/**
 * Compute the life-chart character for a DOB + gender. Returns null when the
 * DOB falls outside the supported 1950-2100 solar-year range or inputs are
 * invalid (NaN date, missing/unknown gender).
 */
export function getLifeChartCharacter(
  dob: Date | string | null | undefined,
  gender: Gender | string | null | undefined,
): LifeChartCharacter | null {
  if (!dob || !gender) return null
  const date = dob instanceof Date ? dob : new Date(dob)
  if (Number.isNaN(date.getTime())) return null
  const g = gender === 'male' || gender === 'female' ? gender : null
  if (!g) return null

  const cy = chineseYearForDate(date)
  if (cy < MIN_YEAR || cy > MAX_YEAR) return null

  const slot = (((cy - MIN_YEAR) % 9) + 9) % 9
  const [maleChar, femaleChar] = CYCLE[slot]
  return g === 'male' ? maleChar : femaleChar
}
