import { describe, it, expect } from 'vitest'
import { TAX_RATE, taxOn } from './pricing'

/**
 * P0 characterization net for the restaurant SST tax helper (single source of
 * truth for every order flow). Pins the exact rounding BEFORE any P6 server-side
 * money re-architecture, so a regression in the tax math is caught immediately.
 */
describe('restaurant pricing — taxOn (6% SST)', () => {
  it('TAX_RATE is 6%', () => {
    expect(TAX_RATE).toBe(0.06)
  })

  it('rounds tax to 2 decimal places at the default rate', () => {
    expect(taxOn(100)).toBe(6)
    expect(taxOn(0)).toBe(0)
    expect(taxOn(9.99)).toBe(0.6) // 9.99*0.06 = 0.5994 -> 0.60
    expect(taxOn(33.33)).toBe(2) //  33.33*0.06 = 1.9998 -> 2.00
  })

  it('honours an explicit rate, including tax-exempt (0)', () => {
    expect(taxOn(100, 0)).toBe(0)
    expect(taxOn(50, 0.06)).toBe(3)
  })

  it('is exactly Math.round(base*rate*100)/100 across a spread of bases', () => {
    for (const base of [0, 1, 12.5, 19.99, 250.75, 1000.01, 7.005]) {
      expect(taxOn(base)).toBe(Math.round(base * 0.06 * 100) / 100)
    }
  })
})
