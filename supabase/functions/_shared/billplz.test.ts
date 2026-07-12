/**
 * billplz.ts — money-path amount-assertion invariants (B9).
 *
 * Run via `deno test` in CI:
 *   deno test supabase/functions/_shared/billplz.test.ts
 *
 * These pin the security-critical contract used by payment-webhook before any
 * paid flip: a Billplz-signed amount (sen) must equal the purchase's stored
 * price (RM), else the credit is refused. The pure helper is fully importable
 * (no server, no DB), so the invariant is testable without an integration
 * harness — the webhook wiring calls exactly this function.
 */
import {
  assertEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { checkBillplzAmount, readField, toNumberOrNull } from './billplz.ts'

// ---------------------------------------------------------------------------
// checkBillplzAmount — match
// ---------------------------------------------------------------------------
Deno.test('match: 990 sen equals RM 9.90 (default extra-match price)', () => {
  assertEquals(checkBillplzAmount('990', 9.90), 'match')
})

Deno.test('match: numeric sen (JSON body) equals RM price', () => {
  assertEquals(checkBillplzAmount(990, 9.9), 'match')
})

Deno.test('match: whole-ringgit price, e.g. RM 50 == 5000 sen', () => {
  assertEquals(checkBillplzAmount('5000', 50), 'match')
})

Deno.test('match: float-drift-prone price 19.90 rounds cleanly to 1990 sen', () => {
  // 19.90 * 100 === 1989.9999999999998 in IEEE-754; Math.round fixes it.
  assertEquals(checkBillplzAmount('1990', 19.90), 'match')
})

Deno.test('match: numeric DB value from readField round-trips', () => {
  const row = { price_rm: 149.9 }
  assertEquals(checkBillplzAmount('14990', readField(row, 'price_rm')), 'match')
})

// ---------------------------------------------------------------------------
// checkBillplzAmount — mismatch (the fraud/misconfig guard)
// ---------------------------------------------------------------------------
Deno.test('mismatch: underpayment (100 sen for a RM 9.90 item)', () => {
  assertEquals(checkBillplzAmount('100', 9.90), 'mismatch')
})

Deno.test('mismatch: overpayment / wrong bill amount', () => {
  assertEquals(checkBillplzAmount('99999', 9.90), 'mismatch')
})

Deno.test('mismatch: off-by-one sen is still a mismatch (no tolerance)', () => {
  assertEquals(checkBillplzAmount('989', 9.90), 'mismatch')
})

Deno.test('mismatch: right digits, wrong scale (990 sen vs RM 990)', () => {
  assertEquals(checkBillplzAmount('990', 990), 'mismatch')
})

// ---------------------------------------------------------------------------
// checkBillplzAmount — unknown (fall back to existing behavior; never block)
// ---------------------------------------------------------------------------
Deno.test('unknown: missing paid amount (undefined) does not block', () => {
  assertEquals(checkBillplzAmount(undefined, 9.90), 'unknown')
})

Deno.test('unknown: empty-string paid amount does not block', () => {
  assertEquals(checkBillplzAmount('', 9.90), 'unknown')
})

Deno.test('unknown: missing expected price (row lacks the column)', () => {
  assertEquals(checkBillplzAmount('990', readField({}, 'amount_rm')), 'unknown')
})

Deno.test('unknown: non-numeric paid amount', () => {
  assertEquals(checkBillplzAmount('not-a-number', 9.90), 'unknown')
})

Deno.test('unknown: null expected', () => {
  assertEquals(checkBillplzAmount('990', null), 'unknown')
})

// ---------------------------------------------------------------------------
// readField — safe extraction off loosely-typed rows
// ---------------------------------------------------------------------------
Deno.test('readField: reads a present key', () => {
  assertEquals(readField({ amount_rm: 9.9 }, 'amount_rm'), 9.9)
})

Deno.test('readField: undefined for missing key', () => {
  assertEquals(readField({ x: 1 }, 'amount_rm'), undefined)
})

Deno.test('readField: undefined for null / non-object rows', () => {
  assertEquals(readField(null, 'amount_rm'), undefined)
  assertEquals(readField(undefined, 'amount_rm'), undefined)
  assertEquals(readField('str', 'amount_rm'), undefined)
})

// ---------------------------------------------------------------------------
// toNumberOrNull — coercion boundary
// ---------------------------------------------------------------------------
Deno.test('toNumberOrNull: parses strings and numbers, rejects junk', () => {
  assertEquals(toNumberOrNull('990'), 990)
  assertEquals(toNumberOrNull(9.9), 9.9)
  assertEquals(toNumberOrNull(''), null)
  assertEquals(toNumberOrNull(null), null)
  assertEquals(toNumberOrNull(undefined), null)
  assertEquals(toNumberOrNull('abc'), null)
  assertEquals(toNumberOrNull(NaN), null)
  assertEquals(toNumberOrNull(Infinity), null)
})
