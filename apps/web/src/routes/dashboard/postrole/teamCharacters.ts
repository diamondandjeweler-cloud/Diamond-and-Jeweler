import type { Gender } from '../../../shared/domain/lifeChart/types'
import type { TeamMember } from './types'

/** One raw team-dynamic reference input sent to the server for derivation. */
export type TeamMemberInput = { y: number; g: Gender }

/**
 * Build the raw team-dynamic reference inputs for `roles.team_member_inputs`.
 *
 * The life-chart character derivation moved server-side (migration 0210 trigger
 * on `roles`, via `compute_life_chart_character`) so the algorithm no longer
 * ships in the public JS bundle (H5). The client only assembles the raw
 * (birth-year, gender) pairs here; the server computes the characters.
 *
 * Same input validation as before — each colleague needs a year in 1950–2100
 * and a gender; invalid rows are dropped; empty result → `null` (the matcher
 * treats a null team as "no team fit").
 */
export function buildTeamMemberInputs(teamMembers: TeamMember[]): TeamMemberInput[] | null {
  const inputs = teamMembers
    .map((m): TeamMemberInput | null => {
      if (!m.dob || !m.gender) return null
      const year = parseInt(m.dob, 10)
      if (!Number.isFinite(year) || year < 1950 || year > 2100) return null
      return { y: year, g: m.gender }
    })
    .filter((x): x is TeamMemberInput => x !== null)
  return inputs.length > 0 ? inputs : null
}
