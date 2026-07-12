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
import {
  checkBillplzAmount,
  readField,
  summarizeBillplzAmount,
  toNumberOrNull,
} from './billplz.ts'

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
// summarizeBillplzAmount — the verdict PLUS the sen pair the B9 mismatch alert
// (BILLPLZ_AMOUNT_MISMATCH) reports as expected_sen / got_sen. checkBillplzAmount
// delegates to this, so these also pin that the verdict never drifts from the
// numbers on-call sees.
// ---------------------------------------------------------------------------
Deno.test('summarize: match returns the aligned sen pair', () => {
  assertEquals(summarizeBillplzAmount('990', 9.90), { check: 'match', gotSen: 990, expectedSen: 990 })
})

Deno.test('summarize: mismatch exposes what was charged vs expected (underpayment)', () => {
  // 100 sen paid for a RM 9.90 item → the finance alert must carry got=100, expected=990.
  assertEquals(summarizeBillplzAmount('100', 9.90), { check: 'mismatch', gotSen: 100, expectedSen: 990 })
})

Deno.test('summarize: mismatch exposes overpayment / wrong bill amount', () => {
  assertEquals(summarizeBillplzAmount('99999', 9.90), { check: 'mismatch', gotSen: 99999, expectedSen: 990 })
})

Deno.test('summarize: float-drift price 19.90 normalises to 1990 sen (no spurious mismatch)', () => {
  assertEquals(summarizeBillplzAmount('1990', 19.90), { check: 'match', gotSen: 1990, expectedSen: 1990 })
})

Deno.test('summarize: numeric JSON-body sen and DB numeric round-trip', () => {
  const row = { price_rm: 149.9 }
  assertEquals(
    summarizeBillplzAmount(14990, readField(row, 'price_rm')),
    { check: 'match', gotSen: 14990, expectedSen: 14990 },
  )
})

Deno.test('summarize: unknown when paid amount is missing (null sen, do not block)', () => {
  assertEquals(summarizeBillplzAmount(undefined, 9.90), { check: 'unknown', gotSen: null, expectedSen: 990 })
})

Deno.test('summarize: unknown when expected price is absent (row lacks column)', () => {
  assertEquals(
    summarizeBillplzAmount('990', readField({}, 'amount_rm')),
    { check: 'unknown', gotSen: 990, expectedSen: null },
  )
})

Deno.test('summarize.check stays identical to checkBillplzAmount (no drift)', () => {
  const cases: Array<[unknown, unknown]> = [
    ['990', 9.90], ['100', 9.90], ['99999', 9.90], ['989', 9.90],
    ['5000', 50], ['1990', 19.90], ['990', 990],
    [undefined, 9.90], ['', 9.90], ['not-a-number', 9.90], ['990', null], ['990', readField({}, 'amount_rm')],
  ]
  for (const [paid, expected] of cases) {
    assertEquals(summarizeBillplzAmount(paid, expected).check, checkBillplzAmount(paid, expected))
  }
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
