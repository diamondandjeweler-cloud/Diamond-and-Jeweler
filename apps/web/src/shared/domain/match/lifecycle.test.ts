import { describe, it, expect } from 'vitest'
import {
  ACTIVE_MATCH_STATUSES,
  ACTIVE_MATCH_STATUSES_FOR_ROLE_TALLY,
  HM_ACTION_NEEDED_STATUSES,
  INTERVIEW_STAGE_STATUSES,
  TALENT_OPEN_STATUSES,
  ADMIN_TRACKED_STATUSES,
  isActiveMatch,
  needsHmAction,
  isTalentOpen,
  isInterviewStage,
  precedingStatuses,
} from './lifecycle'

/**
 * Characterization net for the match-lifecycle sets. Each `toEqual` below pins a
 * set to the EXACT literal (membership AND order) it replaced across
 * hm/types.ts, talent/types.ts, the two dashboard hooks, CandidateCard,
 * OfferCard and admin/KpiPanel. If a future edit reorders or changes membership,
 * these fail — that is the point: order is load-bearing for the admin table, and
 * membership divergences (offer_made / hr_scheduling omissions) are deliberate.
 */
describe('match lifecycle status sets — exact membership + order', () => {
  it('ACTIVE_MATCH_STATUSES matches the former hm/talent ACTIVE literal verbatim', () => {
    expect(ACTIVE_MATCH_STATUSES).toEqual([
      'generated', 'viewed', 'accepted_by_talent',
      'invited_by_manager', 'hr_scheduling',
      'interview_scheduled', 'interview_completed',
      'offer_made',
    ])
  })

  it('ACTIVE_MATCH_STATUSES_FOR_ROLE_TALLY omits offer_made (per-role tally divergence)', () => {
    expect(ACTIVE_MATCH_STATUSES_FOR_ROLE_TALLY).toEqual([
      'generated', 'viewed', 'accepted_by_talent',
      'invited_by_manager', 'hr_scheduling',
      'interview_scheduled', 'interview_completed',
    ])
    // Divergence guard: identical to ACTIVE minus the trailing 'offer_made'.
    expect(ACTIVE_MATCH_STATUSES_FOR_ROLE_TALLY).toEqual(
      ACTIVE_MATCH_STATUSES.filter((s) => s !== 'offer_made'),
    )
  })

  it('HM_ACTION_NEEDED_STATUSES matches the ["generated","viewed","accepted_by_talent"] literal', () => {
    expect(HM_ACTION_NEEDED_STATUSES).toEqual([
      'generated', 'viewed', 'accepted_by_talent',
    ])
  })

  it('INTERVIEW_STAGE_STATUSES omits hr_scheduling (interview-stage divergence)', () => {
    expect(INTERVIEW_STAGE_STATUSES).toEqual([
      'invited_by_manager', 'interview_scheduled', 'interview_completed', 'offer_made',
    ])
    expect(INTERVIEW_STAGE_STATUSES).not.toContain('hr_scheduling')
  })

  it('TALENT_OPEN_STATUSES matches the ["generated","viewed"] literal', () => {
    expect(TALENT_OPEN_STATUSES).toEqual(['generated', 'viewed'])
  })

  it('ADMIN_TRACKED_STATUSES matches the KpiPanel TRACKED_STATUSES literal (order load-bearing)', () => {
    expect(ADMIN_TRACKED_STATUSES).toEqual([
      'generated', 'viewed', 'accepted_by_talent', 'declined_by_talent',
      'invited_by_manager', 'declined_by_manager', 'hr_scheduling',
      'interview_scheduled', 'interview_completed', 'hired', 'expired',
    ])
    // Documented divergence: a superset of ACTIVE that nonetheless omits offer_made.
    expect(ADMIN_TRACKED_STATUSES).not.toContain('offer_made')
  })
})

describe('match lifecycle predicates', () => {
  it('isActiveMatch is true for every ACTIVE member and false otherwise', () => {
    for (const s of ACTIVE_MATCH_STATUSES) expect(isActiveMatch(s)).toBe(true)
    expect(isActiveMatch('hired')).toBe(false)
    expect(isActiveMatch('expired')).toBe(false)
    expect(isActiveMatch('declined_by_talent')).toBe(false)
    expect(isActiveMatch('nonsense')).toBe(false)
  })

  it('needsHmAction is true only for generated/viewed/accepted_by_talent', () => {
    expect(needsHmAction('generated')).toBe(true)
    expect(needsHmAction('viewed')).toBe(true)
    expect(needsHmAction('accepted_by_talent')).toBe(true)
    expect(needsHmAction('invited_by_manager')).toBe(false)
    expect(needsHmAction('offer_made')).toBe(false)
  })

  it('isTalentOpen is true only for generated/viewed', () => {
    expect(isTalentOpen('generated')).toBe(true)
    expect(isTalentOpen('viewed')).toBe(true)
    expect(isTalentOpen('accepted_by_talent')).toBe(false)
    expect(isTalentOpen('offer_made')).toBe(false)
  })

  it('isInterviewStage is true for the 4-member interview set, excluding hr_scheduling', () => {
    expect(isInterviewStage('invited_by_manager')).toBe(true)
    expect(isInterviewStage('interview_scheduled')).toBe(true)
    expect(isInterviewStage('interview_completed')).toBe(true)
    expect(isInterviewStage('offer_made')).toBe(true)
    expect(isInterviewStage('hr_scheduling')).toBe(false)
    expect(isInterviewStage('generated')).toBe(false)
  })
})

describe('precedingStatuses — byte-equivalent to the generated → viewed rule', () => {
  it('returns [viewed] only when the current status is generated', () => {
    expect(precedingStatuses('generated', 'invited_by_manager')).toEqual(['viewed'])
    expect(precedingStatuses('generated', 'declined_by_manager')).toEqual(['viewed'])
  })

  it('returns [] for any non-generated (or undefined) current status', () => {
    expect(precedingStatuses('viewed', 'invited_by_manager')).toEqual([])
    expect(precedingStatuses('accepted_by_talent', 'declined_by_manager')).toEqual([])
    expect(precedingStatuses(undefined, 'invited_by_manager')).toEqual([])
  })
})
