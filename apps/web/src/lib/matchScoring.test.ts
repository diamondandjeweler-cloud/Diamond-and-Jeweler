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
