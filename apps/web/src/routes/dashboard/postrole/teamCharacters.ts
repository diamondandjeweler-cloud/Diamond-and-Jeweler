import { getLifeChartCharacter } from '../../../shared/domain/lifeChart/lifeChartCharacter'
import type { TeamMember } from './types'

/**
 * Compute the life-chart characters for the optional team-dynamic reference rows.
 *
 * Relocated VERBATIM from the inline IIFE that previously built
 * `payload.team_member_characters` inside PostRole's submit handler. Same
 * year-parse, same 1950–2100 bounds, same null-when-empty contract:
 * returns the non-null character array, or `null` when nothing valid was entered.
 */
export function buildTeamMemberCharacters(teamMembers: TeamMember[]) {
  const chars = teamMembers
    .map((m) => {
      if (!m.dob || !m.gender) return null
      const year = parseInt(m.dob, 10)
      if (!Number.isFinite(year) || year < 1950 || year > 2100) return null
      return getLifeChartCharacter(`${year}-07-01`, m.gender)
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
  return chars.length > 0 ? chars : null
}
