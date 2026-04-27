import { describe, it, expect } from 'vitest'
import { PREFERENCE_ASPECTS, PREFERENCE_TO_TAG } from './preference-aspects'

describe('preference-aspects', () => {
  it('exposes exactly 20 aspects (matches spec)', () => {
    expect(PREFERENCE_ASPECTS).toHaveLength(20)
  })

  it('has unique aspect labels', () => {
    const set = new Set(PREFERENCE_ASPECTS)
    expect(set.size).toBe(PREFERENCE_ASPECTS.length)
  })

  it('every mapped aspect appears in PREFERENCE_ASPECTS', () => {
    for (const aspect of Object.keys(PREFERENCE_TO_TAG)) {
      expect(PREFERENCE_ASPECTS).toContain(aspect)
    }
  })

  it('every mapped tag is a seeded talent_expectation tag', () => {
    const seeded = new Set([
      'wants_wlb', 'wants_fair_pay', 'wants_supportive_boss', 'wants_autonomy',
      'wants_growth', 'wants_stability', 'wants_recognition', 'wants_flexibility',
      'wants_mission', 'wants_team_culture',
    ])
    for (const tag of Object.values(PREFERENCE_TO_TAG)) {
      expect(seeded.has(tag)).toBe(true)
    }
  })
})
