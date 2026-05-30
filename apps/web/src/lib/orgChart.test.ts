import { describe, it, expect } from 'vitest'
import {
  ORG_TIERS, ORG_ARCHETYPES,
  orgTierForSize, orgArchetypeLabel,
  computeArchetype, pairScore, runAnalysis,
  type OrgMember,
} from './orgChart'

describe('ORG_TIERS', () => {
  it('covers 1–50 pax in contiguous, non-overlapping bands', () => {
    expect(ORG_TIERS[0].min).toBe(1)
    expect(ORG_TIERS.at(-1)!.max).toBe(50)
    for (let i = 1; i < ORG_TIERS.length; i++) {
      expect(ORG_TIERS[i].min).toBe(ORG_TIERS[i - 1].max + 1)
    }
  })

  it('matches the agreed pricing ladder', () => {
    const expected = [
      ['t1_5', 99],   ['t6_10', 399], ['t11_15', 699], ['t16_20', 999], ['t21_25', 1499],
      ['t26_30', 1999], ['t31_35', 2499], ['t36_40', 2999], ['t41_45', 3499], ['t46_50', 3999],
    ] as const
    expected.forEach(([code, price], i) => {
      expect(ORG_TIERS[i].code).toBe(code)
      expect(ORG_TIERS[i].price).toBe(price)
    })
  })
})

describe('orgTierForSize', () => {
  it('lands each size in the correct tier', () => {
    expect(orgTierForSize(1)?.code).toBe('t1_5')
    expect(orgTierForSize(5)?.code).toBe('t1_5')
    expect(orgTierForSize(6)?.code).toBe('t6_10')
    expect(orgTierForSize(15)?.code).toBe('t11_15')
    expect(orgTierForSize(22)?.code).toBe('t21_25')
    expect(orgTierForSize(33)?.code).toBe('t31_35')
    expect(orgTierForSize(48)?.code).toBe('t46_50')
    expect(orgTierForSize(50)?.code).toBe('t46_50')
  })

  it('returns null for out-of-range', () => {
    expect(orgTierForSize(0)).toBe(null)
    expect(orgTierForSize(51)).toBe(null)
    expect(orgTierForSize(-1)).toBe(null)
    expect(orgTierForSize(100)).toBe(null)
  })
})

describe('orgArchetypeLabel', () => {
  it('returns the friendly label for known codes', () => {
    expect(orgArchetypeLabel('leader')).toBe('Strategic Leader')
    expect(orgArchetypeLabel('connector')).toBe('People Connector')
  })

  it('returns the code unchanged for unknown ones', () => {
    expect(orgArchetypeLabel('mystery')).toBe('mystery')
  })

  it('handles null/undefined/empty', () => {
    expect(orgArchetypeLabel(null)).toBe('')
    expect(orgArchetypeLabel(undefined)).toBe('')
    expect(orgArchetypeLabel('')).toBe('')
  })
})

describe('computeArchetype', () => {
  it('returns a known archetype + score in [60,100]', () => {
    const r = computeArchetype({ name: 'Alice', dob: '1990-05-15' })
    expect(ORG_ARCHETYPES.find(a => a.code === r.code)).toBeTruthy()
    expect(r.score).toBeGreaterThanOrEqual(60)
    expect(r.score).toBeLessThanOrEqual(100)
  })

  it('is deterministic for the same (name, dob)', () => {
    const a = computeArchetype({ name: 'Alice', dob: '1990-05-15' })
    const b = computeArchetype({ name: 'Alice', dob: '1990-05-15' })
    expect(a).toEqual(b)
  })

  it('falls back to analyst@60 for missing or unparseable dob', () => {
    expect(computeArchetype({ name: 'X', dob: '' })).toEqual({ code: 'analyst', score: 60 })
    expect(computeArchetype({ name: 'X', dob: 'not-a-date' })).toEqual({ code: 'analyst', score: 60 })
  })
})

describe('pairScore', () => {
  const mk = (code: string): OrgMember => ({
    name: 'x', current_role: '', dob: '', archetype_code: code,
    suggested_role: null, fit_score: null,
  })

  it('rates same-archetype pair lowest (55)', () => {
    expect(pairScore(mk('leader'), mk('leader'))).toBe(55)
  })

  it('rates adjacent archetypes highly (75 / 85 / 80 / 70)', () => {
    // ORG_ARCHETYPES order: leader, operator, connector, analyst, creator, guardian, catalyst, mentor
    expect(pairScore(mk('leader'),   mk('operator'))).toBe(75)  // dist 1
    expect(pairScore(mk('leader'),   mk('connector'))).toBe(85) // dist 2
    expect(pairScore(mk('leader'),   mk('analyst'))).toBe(80)   // dist 3
    expect(pairScore(mk('leader'),   mk('creator'))).toBe(70)   // dist 4
  })

  it('returns neutral 60 when either archetype is unknown', () => {
    expect(pairScore(mk('leader'), mk('mystery'))).toBe(60)
    expect(pairScore(mk(''),       mk('leader'))).toBe(60)
  })
})

describe('runAnalysis', () => {
  const team: OrgMember[] = [
    { name: 'Alice', current_role: 'CEO',     dob: '1980-03-12', archetype_code: null, suggested_role: null, fit_score: null },
    { name: 'Bob',   current_role: 'CTO',     dob: '1985-07-22', archetype_code: null, suggested_role: null, fit_score: null },
    { name: 'Cara',  current_role: 'COO',     dob: '1990-11-01', archetype_code: null, suggested_role: null, fit_score: null },
    { name: 'Dan',   current_role: 'CFO',     dob: '1988-04-18', archetype_code: null, suggested_role: null, fit_score: null },
  ]

  it('produces N members, N*(N-1)/2 pairs, and a valid analysis blob', () => {
    const { members, pairs, analysis } = runAnalysis(team)
    expect(members).toHaveLength(4)
    expect(pairs).toHaveLength(6) // 4 choose 2
    members.forEach(m => {
      expect(m.archetype_code).toBeTruthy()
      expect(m.fit_score).toBeGreaterThanOrEqual(60)
      expect(m.suggested_role).toBeTruthy()
    })
    expect(analysis.overall_summary).toMatch(/team of 4/i)
    expect(Array.isArray(analysis.leadership_cluster)).toBe(true)
    expect(Array.isArray(analysis.conflict_pairs)).toBe(true)
    expect(Array.isArray(analysis.missing_archetypes)).toBe(true)
    expect(analysis.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('NEVER leaks internal terminology (BaZi-secrecy invariant)', () => {
    const { members, analysis } = runAnalysis(team)
    const FORBIDDEN = /(bazi|八字|life[\s-]?chart|day[\s-]?master|feng[\s-]?shui|bagua|八卦|heavenly[\s-]?stem|earthly[\s-]?branch)/i
    const blob = JSON.stringify({ members, analysis })
    expect(blob).not.toMatch(FORBIDDEN)
  })

  it('caps conflict_pairs at 5', () => {
    const bigTeam: OrgMember[] = Array.from({ length: 10 }, (_, i) => ({
      name: `P${i}`, current_role: 'X', dob: `199${i % 10}-01-01`,
      archetype_code: null, suggested_role: null, fit_score: null,
    }))
    const { analysis } = runAnalysis(bigTeam)
    expect(analysis.conflict_pairs.length).toBeLessThanOrEqual(5)
  })
})
