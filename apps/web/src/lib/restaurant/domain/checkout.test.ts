import { describe, it, expect } from 'vitest'
import { splitItemShare, clampDiscountAdd } from './checkout'

/**
 * Regression net for the cashier checkout money helpers.
 *
 * restaurant-1: split-by-items must charge each guest a tax-INCLUSIVE share of
 * the order total, not the bare pre-tax line sum (which silently drops SST and
 * orphans a tax-sized residual).
 */
describe('restaurant checkout — splitItemShare', () => {
  it('charges the tax-inclusive share, NOT the bare pre-tax sum', () => {
    // Order: subtotal 100, 6% SST -> total 106. Selecting items worth 60 pre-tax.
    // Buggy behaviour charged 60 (pre-tax); correct share is 60/100 * 106 = 63.60.
    expect(splitItemShare(60, 100, 106)).toBe(63.6)
    expect(splitItemShare(60, 100, 106)).not.toBe(60)
  })

  it('complementary splits reconcile exactly to the order total', () => {
    const a = splitItemShare(60, 100, 106)
    const b = splitItemShare(40, 100, 106)
    expect(a).toBe(63.6)
    expect(b).toBe(42.4)
    expect(Math.round((a + b) * 100) / 100).toBe(106)
  })

  it('selecting every item charges the full tax-inclusive total', () => {
    expect(splitItemShare(100, 100, 106)).toBe(106)
  })

  it('apportions a discount + delivery fee bearing total proportionally', () => {
    // subtotal 200, total 189 (e.g. discount + tax + delivery netting to 189).
    // Half the pre-tax items -> half the tax-inclusive total.
    expect(splitItemShare(100, 200, 189)).toBe(94.5)
  })

  it('returns 0 when the order subtotal is zero (no divide-by-zero)', () => {
    expect(splitItemShare(50, 0, 0)).toBe(0)
    expect(splitItemShare(0, 0, 106)).toBe(0)
  })
})

/**
 * restaurant-6: a manual discount must be validated + bounded BEFORE a manager
 * approval is logged, and can never exceed the order subtotal (an unbounded
 * discount drives the taxable base — and tax/total — negative on later recompute).
 */
describe('restaurant checkout — clampDiscountAdd', () => {
  it('returns the new TOTAL discount for a valid add', () => {
    expect(clampDiscountAdd(10, 100, 0)).toBe(10)
    expect(clampDiscountAdd(15, 100, 20)).toBe(35)
  })

  it('rejects a non-positive or non-finite amount (null -> caller aborts before PIN)', () => {
    expect(clampDiscountAdd(0, 100, 0)).toBeNull()
    expect(clampDiscountAdd(-5, 100, 0)).toBeNull()
    expect(clampDiscountAdd(Number.NaN, 100, 0)).toBeNull()
  })

  it('rejects when the order is already fully discounted (no headroom)', () => {
    expect(clampDiscountAdd(5, 100, 100)).toBeNull()
    expect(clampDiscountAdd(5, 100, 120)).toBeNull()
  })

  it('clamps an over-large amount so the total discount never exceeds the subtotal', () => {
    expect(clampDiscountAdd(9999, 100, 0)).toBe(100)
    expect(clampDiscountAdd(9999, 100, 30)).toBe(100)
  })
})
