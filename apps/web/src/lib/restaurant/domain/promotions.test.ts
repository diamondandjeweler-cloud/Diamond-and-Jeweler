import { describe, it, expect } from 'vitest'
import { evaluatePromotion } from './promotions'
import type { Promotion } from '../types'

/**
 * P0 characterization net for the client-side promotion evaluator. Locks the
 * fixed rule order (active → date-range → time-window → min-spend → pct/amount)
 * and the exact cent-rounding so the discount math stays behaviour-identical.
 */
const promo = (over: Partial<Promotion>): Promotion => ({
  id: 'p1',
  branch_id: null,
  name: 'Test promo',
  type: 'percent_off',
  rule_json: {},
  start_date: null,
  end_date: null,
  is_active: true,
  code: null,
  usage_limit: null,
  usage_count: 0,
  ...over,
})

describe('restaurant domain — evaluatePromotion (discount amount)', () => {
  it('inactive promo yields 0', () => {
    expect(evaluatePromotion(promo({ is_active: false, rule_json: { discount_pct: 10 } }), 100)).toBe(0)
  })

  it('not-yet-started promo yields 0', () => {
    const at = new Date('2026-07-09T00:00:00Z')
    expect(evaluatePromotion(promo({ start_date: '2026-08-01T00:00:00Z', rule_json: { discount_pct: 10 } }), 100, at)).toBe(0)
  })

  it('expired promo yields 0', () => {
    const at = new Date('2026-07-09T00:00:00Z')
    expect(evaluatePromotion(promo({ end_date: '2026-07-01T00:00:00Z', rule_json: { discount_pct: 10 } }), 100, at)).toBe(0)
  })

  it('active within date range applies the discount', () => {
    const at = new Date('2026-07-09T00:00:00Z')
    expect(evaluatePromotion(promo({
      start_date: '2026-07-01T00:00:00Z', end_date: '2026-07-31T00:00:00Z', rule_json: { discount_pct: 10 },
    }), 100, at)).toBe(10)
  })

  it('discount_pct rounds to cents', () => {
    expect(evaluatePromotion(promo({ rule_json: { discount_pct: 15 } }), 33.33)).toBe(5)       // 33.33*0.15 = 4.9995 → 5.00
    expect(evaluatePromotion(promo({ rule_json: { discount_pct: 12.5 } }), 57.77)).toBe(7.22)  // 57.77*0.125 = 7.22125 → 7.22
  })

  it('discount_amount is capped at the subtotal', () => {
    expect(evaluatePromotion(promo({ rule_json: { discount_amount: 50 } }), 20)).toBe(20)  // capped
    expect(evaluatePromotion(promo({ rule_json: { discount_amount: 15 } }), 100)).toBe(15) // uncapped
  })

  it('min_spend gate blocks below-threshold subtotals', () => {
    const p = promo({ rule_json: { min_spend: 50, discount_pct: 10 } })
    expect(evaluatePromotion(p, 49.99)).toBe(0)
    expect(evaluatePromotion(p, 50)).toBe(5)
  })

  it('time_based promo only applies inside its HH:MM window', () => {
    const p = promo({ type: 'time_based', rule_json: { start_time: '11:00', end_time: '14:00', discount_pct: 10 } })
    // Local-time constructor keeps getHours() deterministic across time zones.
    expect(evaluatePromotion(p, 100, new Date(2026, 6, 9, 12, 30))).toBe(10) // inside
    expect(evaluatePromotion(p, 100, new Date(2026, 6, 9, 15, 0))).toBe(0)   // after
    expect(evaluatePromotion(p, 100, new Date(2026, 6, 9, 10, 59))).toBe(0)  // before
    expect(evaluatePromotion(p, 100, new Date(2026, 6, 9, 14, 0))).toBe(0)   // end is exclusive
  })

  it('no pct/amount rule yields 0', () => {
    expect(evaluatePromotion(promo({ rule_json: {} }), 100)).toBe(0)
    expect(evaluatePromotion(promo({ rule_json: { min_spend: 10 } }), 100)).toBe(0)
  })

  it('discount_pct over 100 is capped at the subtotal', () => {
    expect(evaluatePromotion(promo({ rule_json: { discount_pct: 120 } }), 100)).toBe(100)
  })

  it('negative discount_pct yields 0', () => {
    expect(evaluatePromotion(promo({ rule_json: { discount_pct: -20 } }), 100)).toBe(0)
  })
})
