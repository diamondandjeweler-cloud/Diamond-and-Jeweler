import { describe, it, expect } from 'vitest'
import { computeShiftVariance, tallyCashierPayments } from './shifts'

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

/**
 * restaurant-2: X/Z reconciliation must count ONLY the closing cashier's own
 * payments — a branch can run concurrent shifts, so a branch-wide list would
 * double-count a peer cashier's cash and trip false variances / bogus manager
 * approvals.
 */
describe('restaurant domain — tallyCashierPayments', () => {
  const rows = [
    { status: 'completed', method: 'cash', amount: 200, processed_by: 'A' },
    { status: 'completed', method: 'cash', amount: 300, processed_by: 'B' }, // peer cashier
    { status: 'completed', method: 'card', amount: 50, processed_by: 'A' },
    { status: 'refunded',  method: 'cash', amount: 40, processed_by: 'A' },   // not completed
    { status: 'completed', method: 'cash', amount: 10, processed_by: null },  // no cashier
  ]

  it('counts only the closing cashier’s completed payments', () => {
    const t = tallyCashierPayments(rows, 'A')
    // A's cash = 200 only (NOT 200 + B's 300 + the null-processed 10).
    expect(t.cashSales).toBe(200)
    expect(t.byMethod).toEqual({ cash: 200, card: 50 })
    expect(t.count).toBe(2)
    expect(t.amount).toBe(250)
  })

  it('does not leak a peer cashier’s cash into the drawer', () => {
    // Before the fix the branch-wide sum would report 200 + 300 = 500.
    expect(tallyCashierPayments(rows, 'A').cashSales).not.toBe(500)
    expect(tallyCashierPayments(rows, 'B').cashSales).toBe(300)
  })

  it('coerces string amounts and ignores non-completed rows', () => {
    const t = tallyCashierPayments(
      [
        { status: 'completed', method: 'qr', amount: '12.50', processed_by: 'A' },
        { status: 'pending',   method: 'qr', amount: '99.00', processed_by: 'A' },
      ],
      'A',
    )
    expect(t.amount).toBe(12.5)
    expect(t.count).toBe(1)
  })
})
