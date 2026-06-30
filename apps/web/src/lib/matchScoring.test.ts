/**
 * Golden-vector + invariant tests for the matcher's final-score composition.
 *
 * Imports the pure scorer from the edge `_shared` module across the package
 * boundary (the same relative-import seam matchReasoning.test.ts uses). This is
 * the first automated coverage of the money-adjacent scoring math the audit
 * flagged as having ZERO tests — it pins the behaviour so a future weight tweak
 * or PHS change can't silently regress.
 */
import { describe, it, expect } from 'vitest'
import {
  composeFinalScore,
  computeBehavioralFitness,
  computeSalaryFit,
  computeEmploymentFit,
  computeExperienceFit,
  computeEducationFit,
  computeLocationScore,
  computeSkillMatch,
  computeLanguageMatch,
  computeCultureFit,
  type ScoreDim,
  type PhsContext,
} from '../../../../supabase/functions/_shared/match-scoring'

/** A neutral PHS context: rule-based fallbacks, no ghost, no active-window boost. */
function baseCtx(over: Partial<PhsContext> = {}): PhsContext {
  return {
    ghostScore: 0,
    ghostThreshold: 3,
    hmInActiveWindow: false,
    talentInActiveWindow: false,
    hmQualityFactor: 1,
    phsShowStored: null,
    phsAcceptStored: null,
    phsProbStored: null,
    phsStay6mStored: null,
    salaryFit: 50,
    cultureFit: 50,
    cultureOffers: null,
    employmentFit: 60,
    backgroundScore: 0,
    tags: {},
    tagComp: 0,
    ...over,
  }
}

describe('composeFinalScore — weight normalisation', () => {
  it('weighted-averages dimension scores by weight', () => {
    const dims: ScoreDim[] = [
      { name: 'a', score: 80, weight: 2 },
      { name: 'b', score: 40, weight: 1 },
    ]
    const r = composeFinalScore(dims, baseCtx())
    expect(r.totalW).toBe(3)
    expect(r.rawScore).toBeCloseTo((80 * 2 + 40 * 1) / 3, 10) // 66.6667
  })

  it('falls back to tagComp as rawScore when no dimension carries weight', () => {
    const dims: ScoreDim[] = [
      { name: 'a', score: 99, weight: 0 },
      { name: 'b', score: 10, weight: 0 },
    ]
    const r = composeFinalScore(dims, baseCtx({ tagComp: 73.5 }))
    expect(r.totalW).toBe(0)
    expect(r.rawScore).toBe(73.5)
    expect(r.effectiveWeights).toEqual({}) // no normalisation when totalW === 0
    expect(r.activeDims).toEqual([])
  })

  it('effectiveWeights normalise to sum 1 and activeDims list weighted dims only', () => {
    const dims: ScoreDim[] = [
      { name: 'a', score: 50, weight: 3 },
      { name: 'b', score: 50, weight: 1 },
      { name: 'c', score: 50, weight: 0 },
    ]
    const r = composeFinalScore(dims, baseCtx())
    expect(r.activeDims).toEqual(['a', 'b'])
    expect(r.effectiveWeights).toEqual({ a: 0.75, b: 0.25, c: 0 })
    const sum = Object.values(r.effectiveWeights).reduce((s, w) => s + w, 0)
    expect(sum).toBeCloseTo(1, 10)
  })
})

describe('composeFinalScore — PHS multiplier', () => {
  it('floors at 0.60 when the joint probability is zero (stored pShow = 0)', () => {
    const dims: ScoreDim[] = [{ name: 'a', score: 50, weight: 1 }]
    const r = composeFinalScore(dims, baseCtx({ phsShowStored: 0 }))
    expect(r.pShow).toBe(0)
    expect(r.phsMultiplier).toBeCloseTo(0.6, 10)
  })

  it('reaches 1.0 when all stored PHS rates are 1', () => {
    const dims: ScoreDim[] = [{ name: 'a', score: 50, weight: 1 }]
    const r = composeFinalScore(dims, baseCtx({
      phsShowStored: 1, phsAcceptStored: 1, phsProbStored: 1, phsStay6mStored: 1,
    }))
    expect(r.phsMultiplier).toBeCloseTo(1.0, 10)
  })

  it('derives rule-based pAccept / pProbation / pStay6m from the fallbacks', () => {
    const dims: ScoreDim[] = [{ name: 'a', score: 50, weight: 1 }]
    const r = composeFinalScore(dims, baseCtx())
    // pShow = max(0.10, 1 - 0*0.15) = 1.0
    expect(r.pShow).toBeCloseTo(1.0, 10)
    // pAccept = 0.5*0.6 + 0.5*0.3 + 0.6*0.1 = 0.51
    expect(r.pAccept).toBeCloseTo(0.51, 10)
    // pProbation = 0.5*0.4 + 0.5*0.35 + 0.5*0.25 = 0.5 (tags absent → 0.5)
    expect(r.pProbation).toBeCloseTo(0.5, 10)
    // pStay6m = 0.5*0.6 + (0/100)*0.4 = 0.3
    expect(r.pStay6m).toBeCloseTo(0.3, 10)
  })

  it('uses behavioural tags for pProbation when present', () => {
    const dims: ScoreDim[] = [{ name: 'a', score: 50, weight: 1 }]
    const r = composeFinalScore(dims, baseCtx({
      tags: { ownership: 1, coachability: 1, resilience: 1 },
    }))
    // pProbation = 1*0.4 + 1*0.35 + 1*0.25 = 1.0
    expect(r.pProbation).toBeCloseTo(1.0, 10)
  })
})

describe('composeFinalScore — ghost penalty & active-window boost', () => {
  it('applies (ghostScore - (threshold-1)) * 10 only above threshold', () => {
    const dims: ScoreDim[] = [{ name: 'a', score: 50, weight: 1 }]
    expect(composeFinalScore(dims, baseCtx({ ghostScore: 2 })).ghostPenalty).toBe(0) // 2 - 2 = 0
    expect(composeFinalScore(dims, baseCtx({ ghostScore: 5 })).ghostPenalty).toBe(30) // (5-2)*10
  })

  it('adds +5 active-window boost only when BOTH sides are in window', () => {
    const dims: ScoreDim[] = [{ name: 'a', score: 50, weight: 1 }]
    expect(composeFinalScore(dims, baseCtx({ hmInActiveWindow: true, talentInActiveWindow: false })).activeWindowBoost).toBe(0)
    expect(composeFinalScore(dims, baseCtx({ hmInActiveWindow: true, talentInActiveWindow: true })).activeWindowBoost).toBe(5)
  })
})

describe('composeFinalScore — final clamp', () => {
  it('clamps the final score to a maximum of 100', () => {
    const dims: ScoreDim[] = [{ name: 'a', score: 100, weight: 1 }]
    const r = composeFinalScore(dims, baseCtx({
      hmQualityFactor: 2, phsShowStored: 1, phsAcceptStored: 1, phsProbStored: 1, phsStay6mStored: 1,
    }))
    // 100 * 1.0 * 2 = 200 → clamp 100
    expect(r.finalScore).toBe(100)
  })

  it('clamps the final score to a minimum of 0 (ghost penalty cannot go negative)', () => {
    const dims: ScoreDim[] = [{ name: 'a', score: 10, weight: 1 }]
    const r = composeFinalScore(dims, baseCtx({ ghostScore: 5 })) // penalty 30 > rawScore*mult
    expect(r.finalScore).toBe(0)
  })

  it('golden vector: full rule-based composition is deterministic', () => {
    const dims: ScoreDim[] = [
      { name: 'a', score: 80, weight: 2 },
      { name: 'b', score: 40, weight: 1 },
    ]
    const r = composeFinalScore(dims, baseCtx())
    // rawScore = 200/3 = 66.6667; phsMultiplier = 0.60 + 0.40*(0.51*1*0.5*0.3) = 0.6306
    // finalScore = 66.6667 * 0.6306 = 42.04
    expect(r.phsMultiplier).toBeCloseTo(0.6306, 10)
    expect(r.finalScore).toBeCloseTo(42.04, 6)
  })
})

describe('computeBehavioralFitness', () => {
  it('returns null when no behavioural tag is present', () => {
    expect(computeBehavioralFitness({})).toBeNull()
    // Unknown keys are ignored — still null.
    expect(computeBehavioralFitness({ not_a_trait: 0.9 })).toBeNull()
  })

  it('weights present tags by BEHAVIORAL_WEIGHTS (single tag → score*100)', () => {
    // Only ownership (w=1.2): (0.5*1.2)/1.2 * 100 = 50.
    expect(computeBehavioralFitness({ ownership: 0.5 })).toBeCloseTo(50, 10)
    // Only confidence (w=0.9): (0.8*0.9)/0.9 * 100 = 80.
    expect(computeBehavioralFitness({ confidence: 0.8 })).toBeCloseTo(80, 10)
  })

  it('golden vector: weighted average of two tags', () => {
    // ownership (1.2) @1.0 + coachability (1.1) @0.5
    // num = 1.0*1.2 + 0.5*1.1 = 1.75 ; den = 1.2 + 1.1 = 2.3 ; *100 = 76.0869…
    const r = computeBehavioralFitness({ ownership: 1, coachability: 0.5 })
    expect(r).toBeCloseTo((1.75 / 2.3) * 100, 10)
  })

  it('all tags at 1.0 → 100', () => {
    const full = {
      ownership: 1, communication_clarity: 1, emotional_maturity: 1,
      problem_solving: 1, resilience: 1, results_orientation: 1,
      professional_attitude: 1, confidence: 1, coachability: 1,
    }
    expect(computeBehavioralFitness(full)).toBeCloseTo(100, 10)
  })
})

describe('computeSalaryFit', () => {
  it('returns null when role max or talent min is missing', () => {
    expect(computeSalaryFit(null, 3000, 4000)).toBeNull()
    expect(computeSalaryFit(5000, null, null)).toBeNull()
  })

  it('returns 100 when role max covers the talent ceiling', () => {
    expect(computeSalaryFit(5000, 3000, 4000)).toBe(100)
    // talentSalMax null → ceiling falls back to talentSalMin.
    expect(computeSalaryFit(3000, 3000, null)).toBe(100)
  })

  it('interpolates 50→100 inside the talent band', () => {
    // roleMax 3500 within [3000,4000]: range=1000, 50 + (500/1000)*50 = 75.
    expect(computeSalaryFit(3500, 3000, 4000)).toBeCloseTo(75, 10)
  })

  it('hits the lower interpolation bound (roleMax == floor) at 50', () => {
    // roleMax 3000 == floor, ceiling 4000: range 1000, 50 + (0/1000)*50 = 50.
    expect(computeSalaryFit(3000, 3000, 4000)).toBeCloseTo(50, 10)
  })

  it('penalises below the talent floor and clamps at 0', () => {
    // roleMax 2400 < min 3000: gap=600, 100 - (600/3000)*200 = 60.
    expect(computeSalaryFit(2400, 3000, 3500)).toBeCloseTo(60, 10)
    // Far below → clamp to 0 (never negative).
    expect(computeSalaryFit(500, 3000, 3500)).toBe(0)
  })
})

describe('computeEmploymentFit', () => {
  it('returns null when the talent has no preferences', () => {
    expect(computeEmploymentFit('full_time', [])).toBeNull()
  })

  it('returns null when the role employment type is unknown', () => {
    expect(computeEmploymentFit('volunteer', ['full_time'])).toBeNull()
  })

  it('takes the BEST matching preference', () => {
    // full_time row: gig=20, contract=70 → best 70.
    expect(computeEmploymentFit('full_time', ['gig', 'contract'])).toBe(70)
    // exact match → 100.
    expect(computeEmploymentFit('part_time', ['part_time'])).toBe(100)
  })

  it('treats an unknown preference as 0 (does not crash)', () => {
    // unknown pref → row[pref] ?? 0; only known one counts.
    expect(computeEmploymentFit('gig', ['unknown_pref', 'part_time'])).toBe(70)
    expect(computeEmploymentFit('gig', ['unknown_pref'])).toBe(0)
  })
})

describe('computeExperienceFit', () => {
  it('returns null when years are unknown or level is unknown', () => {
    expect(computeExperienceFit(null, 'mid')).toBeNull()
    expect(computeExperienceFit(3, 'principal')).toBeNull()
    expect(computeExperienceFit(3, '')).toBeNull()
  })

  it('returns 100 inside the range (inclusive bounds)', () => {
    expect(computeExperienceFit(2, 'mid')).toBe(100) // [2,5] lower bound
    expect(computeExperienceFit(5, 'mid')).toBe(100) // upper bound
  })

  it('decays above the range, floored at 30', () => {
    // mid [2,5], 7y over by 2: 90 - 2*10 = 70.
    expect(computeExperienceFit(7, 'mid')).toBe(70)
    // far over → floor 30.
    expect(computeExperienceFit(50, 'mid')).toBe(30)
  })

  it('decays below the range, floored at 10', () => {
    // senior [5,10], 4y under by 1: 80 - 1*20 = 60.
    expect(computeExperienceFit(4, 'senior')).toBe(60)
    // far under → floor 10.
    expect(computeExperienceFit(0, 'lead')).toBe(10) // lead [8,99], under by 8 → 80-160<10
  })
})

describe('computeEducationFit', () => {
  it('returns null when talent level or effective minimum is missing', () => {
    expect(computeEducationFit(null, 'degree', false)).toBeNull()
    expect(computeEducationFit('degree', null, false)).toBeNull()
  })

  it('soft-passes to 100 when acceptNoExperience is set', () => {
    // Even a below-minimum talent gets 100 under the soft signal.
    expect(computeEducationFit('spm', 'degree', true)).toBe(100)
  })

  it('returns 100 when talent meets or exceeds the minimum', () => {
    expect(computeEducationFit('degree', 'degree', false)).toBe(100)
    expect(computeEducationFit('masters', 'degree', false)).toBe(100)
  })

  it('penalises by 30 per rank below, floored at 20', () => {
    // diploma(2) vs degree(3): 1 below → 100 - 1*30 = 70.
    expect(computeEducationFit('diploma', 'degree', false)).toBe(70)
    // spm(1) vs phd(5): 4 below → 100 - 120 < 20 → floor 20.
    expect(computeEducationFit('spm', 'phd', false)).toBe(20)
  })
})

describe('computeLocationScore', () => {
  it('returns null when location does not matter or a postcode is missing', () => {
    expect(computeLocationScore(false, '50000', '50000')).toBeNull()
    expect(computeLocationScore(true, null, '50000')).toBeNull()
    expect(computeLocationScore(true, '50000', null)).toBeNull()
  })

  it('exact match (ignoring whitespace) → 100', () => {
    expect(computeLocationScore(true, '50 000', '50000')).toBe(100)
  })

  it('prefix tiers: 3→70, 2→40, 1→20, none→0', () => {
    expect(computeLocationScore(true, '50100', '50199')).toBe(70) // share '501'
    expect(computeLocationScore(true, '50123', '50999')).toBe(40) // share '50' (3rd char differs)
    expect(computeLocationScore(true, '50100', '50900')).toBe(40) // share '50'
    expect(computeLocationScore(true, '51000', '59000')).toBe(20) // share '5'
    expect(computeLocationScore(true, '10000', '90000')).toBe(0)  // share nothing
  })
})

describe('computeSkillMatch', () => {
  it('returns null when role lists no required and no preferred skills', () => {
    expect(computeSkillMatch([], [], ['anything'])).toBeNull()
  })

  it('full required overlap → 100 (required are pre-filtered upstream)', () => {
    expect(computeSkillMatch(['sales', 'crm'], [], ['sales', 'crm', 'extra'])).toBe(100)
  })

  it('adds preferred bonus up to +30, capped at 100', () => {
    // req 100 + pref 1/2 *30 = 15 → min(100, 115)=100 (already capped).
    expect(computeSkillMatch(['a'], ['x', 'y'], ['a', 'x'])).toBe(100)
    // no required (reqScore defaults 100) + half preferred → still capped 100.
    expect(computeSkillMatch([], ['x', 'y'], ['x'])).toBe(100)
  })

  it('partial required overlap scales reqScore before the preferred bonus', () => {
    // req 1/2 *100 = 50 ; pref 1/1 *30 = 30 → 80.
    expect(computeSkillMatch(['a', 'b'], ['x'], ['a', 'x'])).toBeCloseTo(80, 10)
  })
})

describe('computeLanguageMatch', () => {
  it('returns null when the role requires no languages', () => {
    expect(computeLanguageMatch([], [{ code: 'en', level: 'native' }])).toBeNull()
  })

  it('scores 100 when the talent meets or exceeds the required level', () => {
    expect(computeLanguageMatch(
      [{ code: 'en', level: 'fluent' }],
      [{ code: 'en', level: 'native' }],
    )).toBe(100)
  })

  it('uses 50 when the talent has the code but no level entry', () => {
    expect(computeLanguageMatch(
      [{ code: 'ms', level: 'fluent' }],
      [{ code: 'en', level: 'native' }], // no ms entry
    )).toBe(50)
  })

  it('penalises a level gap by 30, floored at 20, and averages across languages', () => {
    // en: need fluent(3) got basic(1) gap 2 → 100-60=40 ; ms: 100 → avg 70.
    const r = computeLanguageMatch(
      [{ code: 'en', level: 'fluent' }, { code: 'ms', level: 'basic' }],
      [{ code: 'en', level: 'basic' }, { code: 'ms', level: 'native' }],
    )
    expect(r).toBeCloseTo((40 + 100) / 2, 10)
  })
})

describe('computeCultureFit', () => {
  const KEYS = [
    'wants_wlb', 'wants_fair_pay', 'wants_growth', 'wants_stability',
    'wants_flexibility', 'wants_recognition', 'wants_mission', 'wants_team_culture',
  ] as const

  it('returns 0 when there is no overlap or offers are null', () => {
    expect(computeCultureFit({ wants_growth: 1 }, null, KEYS)).toBe(0)
    expect(computeCultureFit({}, { wants_growth: 1 }, KEYS)).toBe(0)
  })

  it('dot-products wants×offers and averages over all 8 keys', () => {
    // one aligned key at 1×1 = 1 over 8 keys → 12.5.
    expect(computeCultureFit(
      { wants_growth: 1 }, { wants_growth: 1 }, KEYS,
    )).toBeCloseTo((1 / 8) * 100, 10)
  })

  it('golden vector: two partial overlaps', () => {
    // wlb 0.5*1 + fair_pay 1*0.5 = 1.0 over 8 → 12.5.
    const r = computeCultureFit(
      { wants_wlb: 0.5, wants_fair_pay: 1 },
      { wants_wlb: 1, wants_fair_pay: 0.5 },
      KEYS,
    )
    expect(r).toBeCloseTo((1.0 / 8) * 100, 10)
  })

  it('reaches 100 only when every key is fully aligned', () => {
    const all: Record<string, number> = {}
    for (const k of KEYS) all[k] = 1
    expect(computeCultureFit(all, all, KEYS)).toBeCloseTo(100, 10)
  })
})
