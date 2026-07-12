/**
 * Billplz money-path helpers (pure, side-effect-free, unit-tested).
 *
 * The payment webhook already verifies the Billplz X-Signature, which
 * authenticates every field of the callback INCLUDING `amount` (in sen). What
 * the signature does NOT establish is that the paid amount equals the price of
 * the thing being purchased — a bill could be created for a different amount
 * than the purchase record's stored price (server bug) and still be perfectly
 * signed. `checkBillplzAmount` closes that gap: it compares the signed paid
 * amount (sen) against the expected price (RM) before any paid flip.
 *
 * These are deliberately kept in a standalone module (no Supabase / no I/O) so
 * they are importable and exercised by deno test — unlike index.ts, which
 * serve()s a port at module load and cannot be imported.
 */

export type AmountCheck = 'match' | 'mismatch' | 'unknown'

/**
 * Coerce an arbitrary value (string from a form-encoded webhook, number from a
 * JSON body, or a DB numeric) to a finite number, else null.
 */
export function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Safely read a property off an unknown row object without a named-property
 * access (the webhook's Supabase rows are loosely typed). Returns undefined for
 * non-objects.
 */
export function readField(row: unknown, key: string): unknown {
  return row !== null && typeof row === 'object'
    ? (row as Record<string, unknown>)[key]
    : undefined
}

/**
 * Compare a Billplz-signed paid amount (sen) against an expected price (RM).
 *
 *   'match'    — amounts are equal to the sen.
 *   'mismatch' — both are known finite numbers but differ → refuse the credit.
 *   'unknown'  — either side is missing/unparseable → caller falls back to its
 *                existing behavior (do NOT block; Billplz always sends `amount`,
 *                so 'unknown' only arises in degenerate/misconfigured inputs).
 *
 * The RM→sen conversion rounds to avoid binary-float drift (e.g. 9.90 * 100).
 */
export function checkBillplzAmount(paidAmountSen: unknown, expectedRm: unknown): AmountCheck {
  const paid = toNumberOrNull(paidAmountSen)
  const expected = toNumberOrNull(expectedRm)
  if (paid === null || expected === null) return 'unknown'
  const expectedSen = Math.round(expected * 100)
  return Math.round(paid) === expectedSen ? 'match' : 'mismatch'
}
