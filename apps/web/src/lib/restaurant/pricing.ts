/**
 * Single source of truth for the restaurant SST tax rate and the cent-rounding
 * used by every order flow (kiosk, guest QR, add-item, reorder).
 *
 * IMPORTANT — the *taxable base* passed to `taxOn` still differs by flow and is
 * intentionally preserved: the guest QR flow taxes the full `subtotal`;
 * `placeOrder` taxes `Math.max(0, subtotal - discount)`; add-item / reorder tax
 * `subtotal - discount`. That guest-vs-kiosk divergence is deferred to a later
 * phase — do NOT fold a base formula into this helper.
 */

/** Malaysia SST — 6%. */
export const TAX_RATE = 0.06

/**
 * Round `taxableBase * rate` to 2 decimal places (cents), reproducing exactly the
 * arithmetic every restaurant order flow used before this was hoisted:
 *   Math.round(base * rate * 100) / 100
 */
export function taxOn(taxableBase: number, rate: number = TAX_RATE): number {
  return Math.round(taxableBase * rate * 100) / 100
}
