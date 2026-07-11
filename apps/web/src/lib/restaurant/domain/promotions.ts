// Pure, framework-free promotion-discount math (restaurant domain layer — no
// Supabase/React imports; only a type-only import from the schema mirror).
//
// This function was ALREADY pure in `store.ts` (no DB call) — the client-side
// single-promo evaluator used by the kiosk/coupon flow. It is relocated here
// verbatim so the discount math lives in the domain layer with a golden test.
// (The server-side, RPC-backed `evaluateServerPromotions` stays in the DAL.)
import type { Promotion } from '../types'

/**
 * Returns the discount amount in RM for a given `subtotal` at a given moment.
 *
 * Rules run in a fixed order, matching the original inline check:
 *   inactive / not-yet-started / expired  ⇒ 0
 *   time_based outside its HH:MM window    ⇒ 0
 *   subtotal below `min_spend`             ⇒ 0
 *   `discount_pct`  ⇒ Math.round(subtotal * pct / 100 * 100) / 100, clamped to [0, subtotal]
 *   `discount_amount` ⇒ Math.min(subtotal, amount)
 *   otherwise                              ⇒ 0
 *
 * `at` defaults to `new Date()` so production behaviour is unchanged; tests pass
 * a fixed date to make the time-window and date-range checks deterministic.
 */
export function evaluatePromotion(p: Promotion, subtotal: number, at: Date = new Date()): number {
  if (!p.is_active) return 0
  if (p.start_date && new Date(p.start_date) > at) return 0
  if (p.end_date && new Date(p.end_date) < at) return 0
  const rule = (p.rule_json ?? {}) as Record<string, unknown>
  if (p.type === 'time_based') {
    const from = String(rule.start_time ?? '')
    const to = String(rule.end_time ?? '')
    const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    if (from && to && !(hhmm >= from && hhmm < to)) return 0
  }
  const minSpend = Number(rule.min_spend ?? 0)
  if (subtotal < minSpend) return 0
  if (typeof rule.discount_pct === 'number') {
    const d = Math.round(subtotal * (rule.discount_pct as number) / 100 * 100) / 100
    return Math.min(subtotal, Math.max(0, d))
  }
  if (typeof rule.discount_amount === 'number') {
    return Math.min(subtotal, rule.discount_amount as number)
  }
  return 0
}
