import { describe, it, expect } from 'vitest'
import { recomputeOrderTotals } from './orders'
import { taxOn } from '../pricing'

/**
 * Characterization net for recomputeOrderTotals — the pure helper voidItem
 * uses to keep order subtotal/tax/total in sync after a void. Mirrors the
 * addItemToOrder/reorderToOpenOrder formula exactly.
 */
describe('restaurant orders — recomputeOrderTotals', () => {
  it('excludes voided items from the subtotal', () => {
    const items = [
      { quantity: 2, unit_price: 10, modifiers_total: 0, status: 'fired' },
      { quantity: 1, unit_price: 25, modifiers_total: 0, status: 'voided' },
    ]
    const { subtotal } = recomputeOrderTotals(items, 0)
    expect(subtotal).toBe(20)
  })

  it('applies discount to reduce the taxable base and total', () => {
    const items = [
      { quantity: 1, unit_price: 100, modifiers_total: 0, status: 'fired' },
    ]
    const { subtotal, tax, total } = recomputeOrderTotals(items, 10)
    expect(subtotal).toBe(100)
    expect(tax).toBe(taxOn(90))
    expect(total).toBe(90 + taxOn(90))
  })

  it('computes tax as Math.round((subtotal - discount) * 0.06 * 100) / 100', () => {
    const items = [
      { quantity: 3, unit_price: 9.99, modifiers_total: 1.5, status: 'fired' },
    ]
    const discount = 5
    const { subtotal, tax } = recomputeOrderTotals(items, discount)
    expect(tax).toBe(Math.round((subtotal - discount) * 0.06 * 100) / 100)
  })

  it('returns zeroed totals when every item is voided', () => {
    const items = [
      { quantity: 2, unit_price: 10, modifiers_total: 0, status: 'voided' },
      { quantity: 1, unit_price: 5, modifiers_total: 2, status: 'voided' },
    ]
    const { subtotal, tax, total } = recomputeOrderTotals(items, 0)
    expect(subtotal).toBe(0)
    expect(tax).toBe(0)
    expect(total).toBe(0)
  })
})
