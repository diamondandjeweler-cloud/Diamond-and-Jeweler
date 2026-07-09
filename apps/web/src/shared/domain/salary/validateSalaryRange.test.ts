import { describe, it, expect } from 'vitest'
import { validateSalaryRange } from './validateSalaryRange'

/**
 * P0 characterization net for the shared salary-range validator. Locks each of
 * the three call sites' historically-divergent policies (reproduced via options)
 * so the consolidation stays behaviour-identical.
 */
describe('validateSalaryRange', () => {
  it('PostRole / EditRole policy — minMax only, UNCONDITIONAL (fires even when max=0)', () => {
    const opts = { minMaxMessage: 'min<=max' }
    expect(validateSalaryRange(5, 10, opts)).toBeNull()
    expect(validateSalaryRange(10, 10, opts)).toBeNull()
    expect(validateSalaryRange(11, 10, opts)).toBe('min<=max')
    expect(validateSalaryRange(1, 0, opts)).toBe('min<=max')
  })

  it('TalentProfile policy — negative, then ceiling, then minMax-only-when-max>0', () => {
    const opts = {
      negative: { message: 'neg' },
      ceiling: { limit: 500_000, message: 'ceil' },
      minMaxRequiresMaxAboveZero: true,
      minMaxMessage: 'mm',
    }
    expect(validateSalaryRange(-1, 10, opts)).toBe('neg')
    expect(validateSalaryRange(10, -1, opts)).toBe('neg')
    expect(validateSalaryRange(10, 600_000, opts)).toBe('ceil')
    expect(validateSalaryRange(11, 10, opts)).toBe('mm')
    expect(validateSalaryRange(11, 0, opts)).toBeNull() // max=0 skips the minMax check
    expect(validateSalaryRange(5, 10, opts)).toBeNull()
  })

  it('evaluates rules in order: negative before ceiling before minMax', () => {
    const opts = { negative: { message: 'neg' }, ceiling: { limit: 100, message: 'ceil' }, minMaxMessage: 'mm' }
    expect(validateSalaryRange(-1, 600, opts)).toBe('neg') // negative wins over ceiling
    expect(validateSalaryRange(200, 150, opts)).toBe('ceil') // ceiling wins over minMax
  })
})
