import { describe, it, expect } from 'vitest'
import { getYearLuckStage, getCareerNudge } from './yearLuck'

describe('getYearLuckStage (internal)', () => {
  it('anchor years map to stage 1', () => {
    expect(getYearLuckStage('W',  2026)).toBe(1)
    expect(getYearLuckStage('E-', 2027)).toBe(1)
    expect(getYearLuckStage('W+', 2028)).toBe(1)
    expect(getYearLuckStage('W-', 2029)).toBe(1)
    expect(getYearLuckStage('E',  2030)).toBe(1)
    expect(getYearLuckStage('G+', 2031)).toBe(1)
    expect(getYearLuckStage('G-', 2032)).toBe(1)
    expect(getYearLuckStage('E+', 2033)).toBe(1)
    expect(getYearLuckStage('F',  2034)).toBe(1)
  })

  it('W cycles 1..9 across 2026-2034 then wraps', () => {
    expect(getYearLuckStage('W', 2026)).toBe(1)
    expect(getYearLuckStage('W', 2034)).toBe(9)
    expect(getYearLuckStage('W', 2035)).toBe(1)
  })

  it('returns null for unknown character or invalid year', () => {
    expect(getYearLuckStage(null, 2026)).toBe(null)
    expect(getYearLuckStage('X', 2026)).toBe(null)
    expect(getYearLuckStage('W', null)).toBe(null)
    expect(getYearLuckStage('W', NaN)).toBe(null)
  })
})

describe('getCareerNudge', () => {
  it('stage 2 -> skill_dev', () => {
    // F is stage 2 in 2026
    expect(getCareerNudge('F', 2026)).toBe('skill_dev')
  })

  it('stage 4 -> ramp_up', () => {
    // G- is stage 4 in 2026 (anchor 2032 => 2026 = 9-stage offset of -6 => stage 4)
    expect(getCareerNudge('G-', 2026)).toBe('ramp_up')
  })

  it('stages 5/6/7 -> move_fast', () => {
    // G+, E, W- are stages 5, 6, 7 respectively in 2026
    expect(getCareerNudge('G+', 2026)).toBe('move_fast')
    expect(getCareerNudge('E',  2026)).toBe('move_fast')
    expect(getCareerNudge('W-', 2026)).toBe('move_fast')
  })

  it('stages 1, 3, 8, 9 -> null (no nudge)', () => {
    expect(getCareerNudge('W',  2026)).toBe(null) // stage 1
    expect(getCareerNudge('E+', 2026)).toBe(null) // stage 3
    expect(getCareerNudge('W+', 2026)).toBe(null) // stage 8
    expect(getCareerNudge('E-', 2026)).toBe(null) // stage 9
  })

  it('null character returns null', () => {
    expect(getCareerNudge(null, 2026)).toBe(null)
  })
})
