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

  // restaurant-4: a recompute triggered by add-item/reorder/void must NOT drop
  // the order's delivery_fee or an already-applied tip from the persisted total.
  it('includes delivery_fee in the total (delivery orders not undercharged)', () => {
    const items = [{ quantity: 1, unit_price: 100, modifiers_total: 0, status: 'fired' }]
    const { total } = recomputeOrderTotals(items, 0, 0, 10)
    expect(total).toBe(100 + taxOn(100) + 10)
  })

  it('includes an applied tip in the total', () => {
    const items = [{ quantity: 1, unit_price: 100, modifiers_total: 0, status: 'fired' }]
    const { total } = recomputeOrderTotals(items, 0, 5, 0)
    expect(total).toBe(100 + taxOn(100) + 5)
  })

  it('includes both tip and delivery_fee on top of the taxed subtotal', () => {
    const items = [{ quantity: 2, unit_price: 30, modifiers_total: 0, status: 'fired' }]
    const { subtotal, tax, total } = recomputeOrderTotals(items, 6, 4, 8)
    expect(subtotal).toBe(60)
    expect(tax).toBe(taxOn(54)) // (60 - 6)
    expect(total).toBe(60 - 6 + taxOn(54) + 4 + 8)
  })

  it('omitting tip/delivery_fee (2-arg call) is unchanged — no fee bleed', () => {
    const items = [{ quantity: 1, unit_price: 100, modifiers_total: 0, status: 'fired' }]
    const { total } = recomputeOrderTotals(items, 10)
    expect(total).toBe(90 + taxOn(90))
  })

  it('floors the taxable base at 0 so an over-large discount cannot yield negative tax', () => {
    const items = [{ quantity: 1, unit_price: 50, modifiers_total: 0, status: 'fired' }]
    const { tax } = recomputeOrderTotals(items, 80)
    expect(tax).toBe(0)
  })
})
