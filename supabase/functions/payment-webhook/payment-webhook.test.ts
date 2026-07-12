/**
 * payment-webhook — security-invariant tests
 *
 * Run via `deno test` in CI (NOT runnable locally in this dev env — no Deno here).
 *   deno test supabase/functions/payment-webhook/payment-webhook.test.ts
 *
 * WHAT THIS FILE COVERS (the money-path invariants from the audit):
 *   (1) A request with a missing / invalid x_signature is rejected.
 *   (2) A valid-signature replay (duplicate event) is idempotent — no double credit.
 *   (3) A malformed body is handled safely (no crash, no credit).
 *
 * IMPORTABILITY NOTE — why this tests the pure layer, not the HTTP handler:
 *   supabase/functions/payment-webhook/index.ts calls `serve(...)` at module
 *   top-level (binds a port on import) and its security helper
 *   `verifyBillplzSignature` plus the DB branches (`tryPointPurchase`,
 *   `tryConsultBooking`, the extra_match_purchases flip) are module-private and
 *   reach Supabase over the network. None of that can be imported and exercised
 *   in a unit test without booting an HTTP server and a live database.
 *
 *   So we test the PURE, IMPORTABLE primitive the handler depends on:
 *     - `timingSafeEqual` (exported from ../_shared/auth.ts) — the constant-time
 *       comparison that gates signature acceptance.
 *   …and we re-derive the EXACT Billplz X-Signature algorithm from index.ts
 *   (sort params except x_signature → "k|v|k|v" → HMAC-SHA256(apiKey) → lower-hex)
 *   as a local reference `verifyBillplzSignature`, kept byte-for-byte in sync with
 *   the source, to assert the reject / replay-idempotent / malformed invariants at
 *   the algorithm level. crypto.subtle is available in `deno test` with no network.
 *
 *   INTEGRATION HARNESS REQUIRED (out of scope here, flagged for a reviewer):
 *     - End-to-end: actual HTTP POST → 401 on bad sig, 200 + single credit on
 *       first valid call, 200 "already paid" no-op on replay. Needs the function
 *       served + a seeded Postgres (extra_match_purchases / point_purchases /
 *       consult_bookings) so the `payment_status='pending'` affected-row guard,
 *       `award_points` idempotency_key, and `increment_extra_matches_used` RPC can
 *       be observed. Best done with supabase start + a deno HTTP test client.
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { timingSafeEqual } from '../_shared/auth.ts'
import { summarizeBillplzAmount } from '../_shared/billplz.ts'

// ---------------------------------------------------------------------------
// Local reference implementation of the Billplz X-Signature algorithm.
// MUST stay byte-for-byte identical to verifyBillplzSignature in index.ts.
// (index.ts cannot be imported — it serve()s a port at module load.)
// ---------------------------------------------------------------------------
async function billplzSignature(
  params: Record<string, string>,
  apiKey: string,
): Promise<string> {
  const filtered = Object.entries(params)
    .filter(([k]) => k !== 'x_signature')
    .sort(([a], [b]) => a.localeCompare(b))
  const payload = filtered.map(([k, v]) => `${k}|${v}`).join('|')

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Mirrors verifyBillplzSignature: compute, then constant-time compare lower-hex. */
async function verifyBillplzSignature(
  params: Record<string, string>,
  signature: string,
  apiKey: string,
): Promise<boolean> {
  const computed = await billplzSignature(params, apiKey)
  return timingSafeEqual(computed, signature.toLowerCase())
}

const API_KEY = 'test_billplz_api_key_do_not_use_in_prod'

/** A representative Billplz success callback payload (sans signature). */
function samplePayload(): Record<string, string> {
  return {
    id: 'bill_abc123',
    paid_at: '2026-06-17 10:00:00 +0800',
    paid: 'true',
    amount: '1000',
    currency: 'MYR',
    collection_id: 'col_xyz',
    reference_1: 'purchase_0001',
    reference_1_label: 'Purchase',
  }
}

// ===========================================================================
// (1) Missing / invalid x_signature is rejected.
// ===========================================================================

Deno.test('rejects a payload with NO x_signature (empty string)', async () => {
  const params = samplePayload()
  // index.ts does `const sig = params['x_signature'] ?? ''` — absent => ''.
  const ok = await verifyBillplzSignature(params, '', API_KEY)
  assertFalse(ok, 'empty signature must never verify')
})

Deno.test('rejects a tampered/invalid x_signature', async () => {
  const params = samplePayload()
  const ok = await verifyBillplzSignature(params, 'deadbeef'.repeat(8), API_KEY)
  assertFalse(ok, 'arbitrary wrong signature must not verify')
})

Deno.test('rejects when the body is tampered after signing (sig no longer matches)', async () => {
  const params = samplePayload()
  const sig = await billplzSignature(params, API_KEY)
  // Attacker flips the amount but keeps the original signature.
  const tampered = { ...params, amount: '999999' }
  const ok = await verifyBillplzSignature(tampered, sig, API_KEY)
  assertFalse(ok, 'mutating any signed field must invalidate the signature')
})

Deno.test('rejects a signature computed with the wrong API key', async () => {
  const params = samplePayload()
  const sigFromAttackerKey = await billplzSignature(params, 'attacker_guessed_key')
  const ok = await verifyBillplzSignature(params, sigFromAttackerKey, API_KEY)
  assertFalse(ok, 'signature must be bound to the real BILLPLZ_API_KEY')
})

Deno.test('accepts a correctly-signed payload (positive control)', async () => {
  const params = samplePayload()
  const sig = await billplzSignature(params, API_KEY)
  const ok = await verifyBillplzSignature(params, sig, API_KEY)
  assert(ok, 'a genuinely-signed payload must verify')
})

Deno.test('accepts an UPPER-case hex signature (Billplz sends mixed case; index.ts lower-cases)', async () => {
  const params = samplePayload()
  const sig = (await billplzSignature(params, API_KEY)).toUpperCase()
  const ok = await verifyBillplzSignature(params, sig, API_KEY)
  assert(ok, 'case-insensitive hex compare must accept upper-case signatures')
})

// ===========================================================================
// (2) Valid-signature replay / duplicate event is idempotent.
//
// At the pure layer, idempotency means: the SAME payload always yields the SAME
// deterministic signature and the SAME verify result, so the handler's
// downstream guards (payment_status='pending' affected-row check + award_points
// idempotency_key) see an identical, replayable event — they are what prevent
// the double credit. The DB-side no-op on the 2nd call needs the integration
// harness described in the file header.
// ===========================================================================

Deno.test('replayed identical payload produces a byte-identical signature (deterministic)', async () => {
  const params = samplePayload()
  const first = await billplzSignature(params, API_KEY)
  const second = await billplzSignature(params, API_KEY)
  assertEquals(first, second, 'HMAC must be deterministic for replay detection')
})

Deno.test('replayed valid event verifies the same on every delivery (no flip-flop)', async () => {
  const params = samplePayload()
  const sig = await billplzSignature(params, API_KEY)
  // Billplz may deliver the same callback multiple times.
  for (let i = 0; i < 3; i++) {
    const ok = await verifyBillplzSignature(params, sig, API_KEY)
    assert(ok, `delivery #${i + 1} of an identical valid event must verify`)
  }
  // NOTE: the "credit exactly once" guarantee across these 3 deliveries lives in
  // the DB layer (UPDATE ... WHERE payment_status='pending' returning rows, and
  // award_points p_idempotency_key='point_purchase:<id>'). Asserting the single
  // credit requires the integration harness (see file header).
})

Deno.test('param ordering does not change the signature (sort makes replay stable)', async () => {
  const a = samplePayload()
  // Same key/values, different insertion order — Billplz field order is not fixed.
  const b: Record<string, string> = {}
  for (const k of Object.keys(a).reverse()) b[k] = a[k]
  assertEquals(
    await billplzSignature(a, API_KEY),
    await billplzSignature(b, API_KEY),
    'alphabetical sort must make the signature order-independent',
  )
})

// ===========================================================================
// (3) Malformed body is handled safely.
//
// index.ts wraps body parsing in try/catch → 400 "Bad request"; a body that
// parses but is missing fields hits `if (!billId && !purchaseRef) => 400`.
// Here we assert the PURE helpers never throw and never accidentally verify on
// junk input — the property the handler relies on to fail closed.
// ===========================================================================

Deno.test('empty params object does not throw and does not verify against a bogus sig', async () => {
  const ok = await verifyBillplzSignature({}, 'whatever', API_KEY)
  assertFalse(ok, 'an empty/malformed payload must not verify against arbitrary input')
})

Deno.test('params containing ONLY x_signature verify-fail (no signable fields)', async () => {
  // After filtering out x_signature there is nothing to sign; an attacker-supplied
  // signature must still be rejected.
  const ok = await verifyBillplzSignature({ x_signature: 'aa'.repeat(32) }, 'aa'.repeat(32), API_KEY)
  assertFalse(ok, 'a body with no signable fields must not verify')
})

Deno.test('non-ascii / pipe-injection values do not throw and stay tied to their signature', async () => {
  // Values containing the "|" delimiter or unicode must not break HMAC or allow
  // a collision; the genuine signature still verifies, a shifted one does not.
  const evil = { id: 'a|b', reference_1: 'c|d', note: 'café \u{1F600}' }
  const sig = await billplzSignature(evil, API_KEY)
  assert(await verifyBillplzSignature(evil, sig, API_KEY), 'genuine sig over delimiter-laden values verifies')
  // A different grouping of the same characters must produce a different signature.
  const shifted = { id: 'a', reference_1: 'b|c|d', note: 'café \u{1F600}' }
  assertFalse(
    await verifyBillplzSignature(shifted, sig, API_KEY),
    'delimiter ambiguity must not let a re-grouped body reuse a signature',
  )
})

// ===========================================================================
// (4) B9 amount-mismatch branch — a signature-valid PAID callback whose signed
//     amount != the purchase's stored price must be FLAGGED + ALERTED, never
//     credited, and still answered HTTP 200 (so Billplz stops retrying).
//
// index.ts calls `serve()` at module load and reaches Supabase over the network,
// so we mirror the branch WIRING (kept byte-faithful to the three identical B9
// blocks in handleMoneyPath / tryPointPurchase / tryConsultBooking) over the REAL
// pure decision `summarizeBillplzAmount` imported from ../_shared/billplz.ts, with
// fakes for the marker write and the alert. This asserts the decision→action
// mapping: mismatch ⇒ {flag, alert(code+sen pair), no credit, 200}. The DB-side
// persistence of the marker needs the integration harness (see file header).
// ===========================================================================

interface MirrorEffects {
  markerFlagged: Array<{ table: string; id: string }>
  alerts: Array<{ message: string; ctx: Record<string, unknown> }>
  credited: boolean
}

function newEffects(): MirrorEffects {
  return { markerFlagged: [], alerts: [], credited: false }
}

/**
 * Mirror of the B9 amount branch shared by all three money paths in index.ts.
 * MUST stay in sync with the `summarizeBillplzAmount(...).check === 'mismatch'`
 * blocks there: on mismatch → flagAmountMismatch + reportError(BILLPLZ_AMOUNT_
 * MISMATCH incl. expected_sen/got_sen) + return HTTP 200 without crediting; on
 * match/unknown → fall through to the credit path (returns null here).
 */
function runB9AmountBranch(
  amountSen: unknown,
  expectedRm: unknown,
  table: 'extra_match_purchases' | 'point_purchases' | 'consult_bookings',
  rowId: string,
  eff: MirrorEffects,
): { status: number } | null {
  const amount = summarizeBillplzAmount(amountSen, expectedRm)
  if (amount.check === 'mismatch') {
    eff.markerFlagged.push({ table, id: rowId })          // flagAmountMismatch (best-effort marker)
    eff.alerts.push({
      message: `billplz amount mismatch (${table})`,
      ctx: {
        fn: 'payment-webhook', code: 'BILLPLZ_AMOUNT_MISMATCH', table,
        expected_sen: amount.expectedSen, got_sen: amount.gotSen,
      },
    })
    return { status: 200 }                                // 200 so Billplz stops retrying
  }
  eff.credited = true                                     // match/unknown → proceed to paid flip
  return null
}

Deno.test('B9: mismatch flags the row, alerts with the sen pair, does NOT credit, returns 200', () => {
  const eff = newEffects()
  // Underpayment: 100 sen paid for a RM 9.90 extra match.
  const res = runB9AmountBranch('100', 9.90, 'extra_match_purchases', 'emp_1', eff)
  assertEquals(res, { status: 200 }, 'mismatch must still answer 200 (Billplz stops retrying)')
  assertFalse(eff.credited, 'a mismatched amount must NEVER credit')
  assertEquals(eff.markerFlagged, [{ table: 'extra_match_purchases', id: 'emp_1' }], 'row must be flagged for finance')
  assertEquals(eff.alerts.length, 1, 'exactly one alert per mismatch')
  assertEquals(eff.alerts[0].ctx.code, 'BILLPLZ_AMOUNT_MISMATCH')
  assertEquals(eff.alerts[0].ctx.expected_sen, 990, 'alert carries the expected price in sen')
  assertEquals(eff.alerts[0].ctx.got_sen, 100, 'alert carries what was actually charged in sen')
})

Deno.test('B9: a correctly-priced paid callback takes the CREDIT path (no flag, no alert)', () => {
  const eff = newEffects()
  const res = runB9AmountBranch('990', 9.90, 'extra_match_purchases', 'emp_1', eff)
  assertEquals(res, null, 'a matching amount must fall through to the credit path')
  assert(eff.credited, 'a matching amount proceeds to the paid flip')
  assertEquals(eff.markerFlagged.length, 0, 'no finance flag on a good payment')
  assertEquals(eff.alerts.length, 0, 'no mismatch alert on a good payment')
})

Deno.test('B9: unknown (amount/price absent) does NOT block — falls through, no flag/alert', () => {
  const eff = newEffects()
  const res = runB9AmountBranch(undefined, 9.90, 'point_purchases', 'pp_1', eff)
  assertEquals(res, null, "'unknown' must not block the existing behavior")
  assert(eff.credited)
  assertEquals(eff.markerFlagged.length, 0)
  assertEquals(eff.alerts.length, 0)
})

Deno.test('B9: duplicate mismatch callback is idempotent-safe — re-flags, never credits', () => {
  const eff = newEffects()
  // Billplz is not idempotent, but a replay/duplicate must never corrupt state.
  const first = runB9AmountBranch('100', 9.90, 'consult_bookings', 'cb_1', eff)
  const second = runB9AmountBranch('100', 9.90, 'consult_bookings', 'cb_1', eff)
  assertEquals(first, { status: 200 })
  assertEquals(second, { status: 200 })
  assertFalse(eff.credited, 'no delivery of a duplicate mismatch may ever credit')
  // Marker is idempotent (true → true); re-flagging the same row is harmless.
  assertEquals(eff.markerFlagged, [
    { table: 'consult_bookings', id: 'cb_1' },
    { table: 'consult_bookings', id: 'cb_1' },
  ])
})

Deno.test('B9: the same branch shape applies across all three money paths', () => {
  for (const table of ['extra_match_purchases', 'point_purchases', 'consult_bookings'] as const) {
    const eff = newEffects()
    const res = runB9AmountBranch('99999', 9.90, table, `${table}_x`, eff)
    assertEquals(res, { status: 200 })
    assertFalse(eff.credited)
    assertEquals(eff.alerts[0].ctx.table, table)
    assertEquals(eff.alerts[0].ctx.got_sen, 99999)
    assertEquals(eff.alerts[0].ctx.expected_sen, 990)
  }
})

// ===========================================================================
// Direct unit tests for the imported pure primitive: timingSafeEqual.
// This is the actual exported helper from ../_shared/auth.ts that gates
// signature acceptance, so it is tested on its own (no re-derivation).
// ===========================================================================

Deno.test('timingSafeEqual: equal strings compare true', () => {
  assert(timingSafeEqual('abc123', 'abc123'))
})

Deno.test('timingSafeEqual: different strings compare false', () => {
  assertFalse(timingSafeEqual('abc123', 'abc124'))
})

Deno.test('timingSafeEqual: different lengths compare false (no early-return leak)', () => {
  assertFalse(timingSafeEqual('abc', 'abcd'))
  assertFalse(timingSafeEqual('', 'x'))
})

Deno.test('timingSafeEqual: two empty strings compare true', () => {
  assert(timingSafeEqual('', ''))
})
