import type { Gender } from '../../../shared/domain/lifeChart/types'

/**
 * One existing-colleague reference row in the optional "Team-dynamic" section.
 * Relocated verbatim from PostRole.tsx — same shape, same semantics.
 */
export type TeamMember = { dob: string; gender: '' | Gender }

/**
 * The fixed set of behavioural traits an HM can require on a role.
 * Relocated verbatim from PostRole.tsx (was a module-level `const TRAITS`).
 */
export const TRAITS = [
  'self_starter', 'reliable', 'collaborator', 'growth_minded', 'clear_communicator',
  'detail_oriented', 'adaptable', 'customer_focused', 'analytical', 'accountable',
]

/** localStorage key for the auto-saved role-posting draft. */
export const DRAFT_KEY = 'hm_role_draft'
