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
 * Full result of an amount comparison: the verdict plus the two normalised sen
 * values that produced it. The sen pair is what the webhook attaches to its
 * BILLPLZ_AMOUNT_MISMATCH finance alert so on-call can see, at a glance, what was
 * charged vs. what the purchase should have cost. Kept as a pure function so both
 * the verdict AND the alert payload are unit-testable off the same source of
 * truth (no drift between "what we decided" and "what we reported").
 *
 *   gotSen      — the Billplz-signed paid amount, rounded to sen, or null.
 *   expectedSen — the purchase's stored price (RM→sen, rounded), or null.
 *   check       — 'match' | 'mismatch' | 'unknown' (see checkBillplzAmount).
 *
 * The RM→sen conversion rounds to avoid binary-float drift (e.g. 9.90 * 100).
 */
export interface BillplzAmountResult {
  check: AmountCheck
  gotSen: number | null
  expectedSen: number | null
}

export function summarizeBillplzAmount(paidAmountSen: unknown, expectedRm: unknown): BillplzAmountResult {
  const paid = toNumberOrNull(paidAmountSen)
  const expected = toNumberOrNull(expectedRm)
  const gotSen = paid === null ? null : Math.round(paid)
  const expectedSen = expected === null ? null : Math.round(expected * 100)
  const check: AmountCheck = gotSen === null || expectedSen === null
    ? 'unknown'
    : gotSen === expectedSen
      ? 'match'
      : 'mismatch'
  return { check, gotSen, expectedSen }
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
 * Thin verdict-only wrapper over summarizeBillplzAmount (single source of truth).
 */
export function checkBillplzAmount(paidAmountSen: unknown, expectedRm: unknown): AmountCheck {
  return summarizeBillplzAmount(paidAmountSen, expectedRm).check
}
