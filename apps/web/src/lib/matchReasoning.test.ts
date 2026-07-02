import { describe, it, expect } from 'vitest'
import { buildPublicReasoning, type ReasoningCandidate } from '../shared/domain/matcher'

// ---------------------------------------------------------------------------
// Unit tests for the matcher's public-reasoning layer (extracted from
// match-core.ts so it can run under vitest). These pin three things:
//   1. Determinism — same (talent_id, roleId) always yields identical copy.
//   2. The branching logic — score bands, trait gaps, the uncertainty warning.
//   3. THE SECRECY INVARIANT — the HM-facing strings must NEVER leak the
//      proprietary compatibility-model vocabulary (BaZi / life-chart / fortune
//      / character bucket), including the v2 team-dynamic branch. This is the
//      automated guard the audit's Blocker-1/secrecy theme was missing on this
//      surface.
// ---------------------------------------------------------------------------

const FORBIDDEN = /bazi|八字|life[\s-]?chart|fortune|character\s*bucket|destiny|zodiac/i

function mk(overrides: Partial<ReasoningCandidate> = {}): ReasoningCandidate {
  return {
    talent_id: 'tal-1',
    tagComp: 50,
    cultureComparison: { talent_top_wants: [], hm_top_offers: [], overlap: [], talent_only: [], hm_only: [], labels: {} },
    ageScore: null,
    locationScore: null,
    backgroundScore: 75,
    behavioralFitness: null,
    salaryFit: null,
    employmentFit: null,
    feedbackScore: null,
    experienceFit: null,
    educationFit: null,
    careerGoalFit: null,
    jobIntentionFit: null,
    talentShortestTenure: null,
    talentRedFlagsCount: 0,
    finalScore: 60,
    ghostScore: 0,
    ghostThreshold: 100,
    cultureDataSource: 'self_reported',
    activeWindowBoth: false,
    talentNeedsRamp: false,
    mustHaveItems: [],
    dealBreakerItems: [],
    talentBehavioralTags: {},
    monthlyBoostScore: 0,
    characterBucket: null,
    reasoning: { talent_tag_overlap: {}, weight_sum: 0 },
    ...overrides,
  }
}

describe('buildPublicReasoning — shape & determinism', () => {
  it('returns the documented shape', () => {
    const out = buildPublicReasoning(mk(), [], false, 'role-1')
    expect(out).toHaveProperty('score_band')
    expect(Array.isArray(out.strengths)).toBe(true)
    expect(Array.isArray(out.watchouts)).toBe(true)
    expect(out).toHaveProperty('matched_traits')
    expect(out).toHaveProperty('missing_traits')
    expect(out.note).toMatch(/final hiring decisions remain yours/i)
  })

  it('is deterministic for the same (talent_id, roleId)', () => {
    const c = mk({ talent_id: 'tal-xyz', tagComp: 80 })
    const a = buildPublicReasoning(c, ['leadership'], false, 'role-9')
    const b = buildPublicReasoning(c, ['leadership'], false, 'role-9')
    expect(a).toEqual(b)
  })
})

describe('buildPublicReasoning — score banding', () => {
  it('maps finalScore to strong / good / cautious at the right thresholds', () => {
    expect(buildPublicReasoning(mk({ finalScore: 75 }), [], false, 'r').score_band).toBe('strong')
    expect(buildPublicReasoning(mk({ finalScore: 74 }), [], false, 'r').score_band).toBe('good')
    expect(buildPublicReasoning(mk({ finalScore: 50 }), [], false, 'r').score_band).toBe('good')
    expect(buildPublicReasoning(mk({ finalScore: 49 }), [], false, 'r').score_band).toBe('cautious')
  })
})

describe('buildPublicReasoning — branching logic', () => {
  it('reports matched vs missing required traits', () => {
    const c = mk({ reasoning: { talent_tag_overlap: { leadership: 1, sql: 1 }, weight_sum: 2 } })
    const out = buildPublicReasoning(c, ['leadership', 'sql', 'python'], false, 'r')
    expect(out.matched_traits.sort()).toEqual(['leadership', 'sql'])
    expect(out.missing_traits).toEqual(['python'])
    expect(out.watchouts.some((w) => w.includes('python'))).toBe(true)
  })

  it('strong skills produce a strength; weak skills produce a watchout', () => {
    const strong = buildPublicReasoning(mk({ tagComp: 90 }), [], false, 'r')
    expect(strong.strengths.some((s) => /skill/i.test(s))).toBe(true)
    const weak = buildPublicReasoning(mk({ tagComp: 20 }), [], false, 'r')
    expect(weak.watchouts.some((w) => /skill/i.test(w))).toBe(true)
  })

  it('emits the structured-second-round warning when >=4 dimensions are uncertain', () => {
    const c = mk({ tagComp: 30, salaryFit: 30, behavioralFitness: 30, backgroundScore: 30 })
    const out = buildPublicReasoning(c, [], false, 'r')
    expect(out.watchouts.some((w) => /evaluation dimensions as uncertain/i.test(w))).toBe(true)
  })

  it('v2 team-dynamic branch yields a generic note, never model vocabulary', () => {
    const bad = buildPublicReasoning(mk({ characterBucket: 'bad', finalScore: 80 }), [], true, 'r')
    expect(bad.watchouts.some((w) => /team[\s-]?dynamic|working[\s-]?style/i.test(w))).toBe(true)
    expect(JSON.stringify(bad)).not.toMatch(FORBIDDEN)

    const good = buildPublicReasoning(mk({ characterBucket: 'good', finalScore: 80 }), [], true, 'r')
    expect(good.strengths.some((s) => /integrate smoothly/i.test(s))).toBe(true)
    expect(JSON.stringify(good)).not.toMatch(FORBIDDEN)
  })
})

describe('buildPublicReasoning — SECRECY INVARIANT', () => {
  it('never leaks proprietary vocabulary across a broad permutation sweep', () => {
    const buckets: Array<string | null> = [null, 'good', 'bad', 'neutral']
    const sources = ['self_reported', 'ai_inferred']
    const scores = [10, 49, 74, 100]
    for (const v2 of [false, true]) {
      for (const characterBucket of buckets) {
        for (const cultureDataSource of sources) {
          for (const finalScore of scores) {
            const out = buildPublicReasoning(
              mk({
                characterBucket,
                cultureDataSource,
                finalScore,
                // Exercise as many sentence branches as possible.
                tagComp: 30,
                salaryFit: 20,
                employmentFit: 40,
                behavioralFitness: 30,
                feedbackScore: 20,
                backgroundScore: 30,
                experienceFit: 20,
                educationFit: 40,
                careerGoalFit: 20,
                jobIntentionFit: 50,
                ageScore: 20,
                locationScore: 20,
                talentRedFlagsCount: 2,
                talentShortestTenure: 6,
                ghostScore: 100,
                ghostThreshold: 50,
                monthlyBoostScore: 100,
                activeWindowBoth: true,
                talentNeedsRamp: true,
                mustHaveItems: ['Must verify license', 'Relocation'],
                dealBreakerItems: ['No night shifts'],
                talentBehavioralTags: { ownership: 0.9, resilience: 0.2, communication_clarity: 0.8, problem_solving: 0.1 },
                cultureComparison: { talent_top_wants: ['wants_growth', 'wants_wlb'], hm_top_offers: ['wants_growth'], overlap: ['wants_growth'], talent_only: ['wants_wlb'], hm_only: [], labels: {} },
                reasoning: { talent_tag_overlap: { leadership: 1 }, weight_sum: 1 },
              }),
              ['leadership', 'python', 'sql'],
              v2,
              'role-secrecy',
            )
            expect(JSON.stringify(out)).not.toMatch(FORBIDDEN)
          }
        }
      }
    }
  })
})
