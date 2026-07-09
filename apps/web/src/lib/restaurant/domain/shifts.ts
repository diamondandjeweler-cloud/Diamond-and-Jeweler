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
