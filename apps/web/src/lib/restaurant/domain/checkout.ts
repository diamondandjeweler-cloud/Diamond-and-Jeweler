// Pure, framework-free cashier checkout money math (restaurant domain layer — no
// Supabase/React imports). Keeps the split-by-items and manual-discount
// arithmetic testable and consistent with the canonical order total.

/**
 * Tax-inclusive share for a SUBSET of an order's items ("split by items").
 *
 * Menu prices are tax-EXCLUSIVE and `order.total` is tax-INCLUSIVE
 * (subtotal - discount + tax + tip + delivery_fee). Charging the bare pre-tax
 * line sum for a subset silently drops that subset's share of SST / discount /
 * tip / delivery, undercharging each guest and orphaning a tax-sized residual.
 *
 * Instead allocate each split its PROPORTION of the tax-inclusive total, by the
 * ratio of its selected pre-tax sum to the order's pre-tax subtotal. The caller
 * is responsible for handing the final settling split any rounding residual
 * (charge the exact remaining balance) so the splits reconcile to order.total.
 */
export function splitItemShare(
  selectedPreTax: number,
  orderSubtotal: number,
  orderTotal: number,
): number {
  if (!(orderSubtotal > 0)) return 0
  return Math.round((selectedPreTax / orderSubtotal) * orderTotal * 100) / 100
}

/**
 * Validate + bound a manual discount ADD against an order.
 *
 * Returns the NEW TOTAL discount (existing + requested), clamped so it can never
 * exceed the order subtotal — an unbounded discount larger than the subtotal
 * would drive the taxable base (and hence tax/total) negative on any later
 * recompute. Returns `null` when the request is invalid (non-positive amount, or
 * the order is already fully discounted), so the caller can reject BEFORE
 * logging a manager approval for a discount that will not be applied.
 */
export function clampDiscountAdd(
  amtRaw: number,
  subtotal: number,
  existingDiscount: number,
): number | null {
  if (!Number.isFinite(amtRaw) || amtRaw <= 0) return null
  const headroom = subtotal - existingDiscount
  if (headroom <= 0) return null
  const applied = Math.min(amtRaw, headroom)
  return Math.round((existingDiscount + applied) * 100) / 100
}
