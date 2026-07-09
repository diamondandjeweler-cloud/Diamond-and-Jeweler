import { describe, it, expect } from 'vitest'
import { computeShiftVariance } from './shifts'

/**
 * P0 characterization net for the cashier-shift close math. Pins
 * expected = openingFloat + cashSales and variance = actualCash - expected.
 */
describe('restaurant domain — computeShiftVariance', () => {
  it('balanced drawer has zero variance', () => {
    expect(computeShiftVariance(200, 800, 1000)).toEqual({ expected: 1000, variance: 0 })
  })

  it('over (more cash than expected) yields positive variance', () => {
    expect(computeShiftVariance(200, 800, 1050)).toEqual({ expected: 1000, variance: 50 })
  })

  it('short (less cash than expected) yields negative variance', () => {
    expect(computeShiftVariance(200, 800, 950)).toEqual({ expected: 1000, variance: -50 })
  })

  it('zero cash sales expects only the opening float', () => {
    expect(computeShiftVariance(150, 0, 150)).toEqual({ expected: 150, variance: 0 })
  })

  it('preserves fractional cents without rounding (raw float subtraction)', () => {
    const r = computeShiftVariance(100.5, 49.25, 149.7)
    expect(r.expected).toBe(149.75)
    // Not cent-rounded: exactly the raw IEEE-754 difference, matching the DAL.
    expect(r.variance).toBe(149.7 - 149.75)
  })
})
