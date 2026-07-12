// Pure, framework-free cashier-shift math (restaurant domain layer — no
// Supabase/React imports). Extracted verbatim from `store.closeShift` so the
// expected-cash / variance calc is testable; the DAL keeps the shift read, the
// numeric coercion of the DB field, and the update write.

export interface ShiftVariance {
  /** Cash the drawer should hold: opening float + counted cash sales. */
  expected: number
  /** Over/short: actual counted cash minus expected. Positive = over. */
  variance: number
}

/**
 * Reproduce exactly the arithmetic `store.closeShift` used before this was
 * hoisted:
 *   expected = openingFloat + cashSales
 *   variance = actualCash - expected
 *
 * Callers pass already-coerced numbers (the DAL does `Number(shift.opening_float)`
 * and pulls `report.cash_sales ?? 0`) so this stays a pure numeric function.
 */
export function computeShiftVariance(
  openingFloat: number,
  cashSales: number,
  actualCash: number,
): ShiftVariance {
  const expected = openingFloat + cashSales
  const variance = actualCash - expected
  return { expected, variance }
}

export interface CashierTally {
  /** Sum of this cashier's completed CASH payments — the drawer's expected cash. */
  cashSales: number
  /** Completed total per payment method (all methods), for the X/Z breakdown. */
  byMethod: Record<string, number>
  /** Number of completed payments counted. */
  count: number
  /** Sum of all completed payments (every method). */
  amount: number
}

/**
 * Reconcile a single cashier's X/Z report from a payment list.
 *
 * A branch can run CONCURRENT cashier shifts (getOpenShift keys on
 * branch+employee, no single-open-shift constraint), and the payment table has
 * no shift_id, so a branch-wide payment list would double-count a *peer*
 * cashier's takings into the closing cashier's drawer — producing false cash
 * variances and bogus manager-approval gates. Count ONLY the completed payments
 * this cashier processed (`processed_by === employeeId`); cash-method rows feed
 * the drawer variance, every method feeds the by-method breakdown.
 */
export function tallyCashierPayments(
  payments: { status: string; method: string; amount: number | string; processed_by?: string | null }[],
  employeeId: string,
): CashierTally {
  const tally: CashierTally = { cashSales: 0, byMethod: {}, count: 0, amount: 0 }
  for (const p of payments) {
    if (p.status !== 'completed') continue
    if (p.processed_by !== employeeId) continue
    const amt = Number(p.amount)
    tally.count += 1
    tally.amount += amt
    tally.byMethod[p.method] = (tally.byMethod[p.method] ?? 0) + amt
    if (p.method === 'cash') tally.cashSales += amt
  }
  return tally
}
