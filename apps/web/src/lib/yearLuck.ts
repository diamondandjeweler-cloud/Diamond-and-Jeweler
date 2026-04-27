/**
 * Internal stage utility (private — never expose stage numbers or
 * descriptive text in the bundle that surfaces to users).
 *
 * The matching engine uses these helpers to decide which generic
 * career-nudge copy to render. UI components must call
 * `getCareerNudge` and never quote stage texts.
 */

import type { LifeChartCharacter } from './lifeChartCharacter'

const ANCHOR_YEAR: Record<LifeChartCharacter, number> = {
  'W':  2026, 'E-': 2027, 'W+': 2028, 'W-': 2029, 'E':  2030,
  'G+': 2031, 'G-': 2032, 'E+': 2033, 'F':  2034,
}

function isKnownChar(s: string): s is LifeChartCharacter {
  return s in ANCHOR_YEAR
}

/** Stage 1..9 for (character, year). null when inputs unknown. Internal use only. */
export function getYearLuckStage(
  character: string | null | undefined,
  year: number | null | undefined,
): number | null {
  if (!character || year == null || !Number.isFinite(year)) return null
  if (!isKnownChar(character)) return null
  const anchor = ANCHOR_YEAR[character]
  return ((((year - anchor) % 9) + 9) % 9) + 1
}

/**
 * Generic career-nudge category derived from internal stage.
 *
 * - 'skill_dev': good period to invest in courses / certifications
 * - 'move_fast': active-move window — recommend acting on opportunities
 * - 'ramp_up':   off-cycle for big moves; signals ramp-up support if hired
 * - null:        no actionable nudge
 *
 * UI MUST render generic, non-method-revealing copy keyed off these
 * categories — never expose stage numbers, character codes, year-luck
 * vocabulary, or anything that would let an observer reverse-engineer the
 * matching method.
 */
export type CareerNudge = 'skill_dev' | 'move_fast' | 'ramp_up' | null

const STAGE_TO_NUDGE: Record<number, CareerNudge> = {
  1: null,
  2: 'skill_dev',
  3: null,
  4: 'ramp_up',
  5: 'move_fast',
  6: 'move_fast',
  7: 'move_fast',
  8: null,
  9: null,
}

export function getCareerNudge(
  character: string | null | undefined,
  year: number | null | undefined,
): CareerNudge {
  const stage = getYearLuckStage(character, year)
  if (stage == null) return null
  return STAGE_TO_NUDGE[stage]
}
