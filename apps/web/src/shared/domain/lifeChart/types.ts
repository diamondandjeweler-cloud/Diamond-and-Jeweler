/**
 * Life-chart TYPE aliases only — no derivation logic.
 *
 * Split out of lifeChartCharacter.ts (deleted 2026-07-18, H5) so the
 * character-derivation algorithm no longer ships in the public JS bundle. These
 * are compile-time-only type aliases — they are erased by the TypeScript
 * compiler and carry nothing into the bundle. The DOB → character derivation
 * now lives exclusively server-side (SQL `compute_life_chart_character`, fed by
 * BEFORE-INSERT triggers on talents / hiring_managers / roles).
 */

export type Gender = 'male' | 'female'

export type LifeChartCharacter =
  | 'E' | 'W' | 'F'
  | 'E+' | 'E-'
  | 'W+' | 'W-'
  | 'G+' | 'G-'

/**
 * Generic career-nudge category returned by the server-side `get_career_nudge`
 * RPC. The year-luck derivation that produces it lives server-side; the client
 * only renders generic, non-method-revealing copy keyed off this category and
 * never exposes stages, character codes, or year-cycle vocabulary.
 */
export type CareerNudge = 'skill_dev' | 'move_fast' | 'ramp_up' | null
