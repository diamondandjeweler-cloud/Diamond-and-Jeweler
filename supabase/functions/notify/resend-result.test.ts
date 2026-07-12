/**
 * notify — Resend send-outcome tests (findings notifications-1/fresh-commits-1/split-state-1)
 *
 * Run in CI's edge-tests job: deno test --allow-all --no-check supabase/functions/
 * Hermetic — no network, no DB, no secrets (only std/assert).
 *
 * WHAT THIS PINS
 *   Resend v3 (npm:resend@3.2.0) RESOLVES API-level rejections (429 rate_limit,
 *   422 validation, 403 domain-not-verified, 5xx) to `{ data: null, error }` and
 *   does NOT throw. The BUG being regression-guarded: notify recorded such a
 *   response as a successful send — flipping the B4 outbox row to terminal
 *   'sent', which claim_notification_retry_batch never re-fires, silently losing
 *   the email. The fix inspects `resp.error` via resendSendError(). This file:
 *     (1) tests the REAL resendSendError / extractProviderId helpers, and
 *     (2) mirrors notify/index.ts's send branch over those REAL helpers to pin
 *         the WIRING: an error response records a FAILED outbox attempt (retry
 *         scheduled), never a success + never the false 'email' audit row.
 *
 *   The mirror MUST stay in sync with the try-block in notify/index.ts (the same
 *   contract-of-record pattern as match-generate/index.test.ts, since index.ts
 *   serve()s a port at module load and cannot be imported).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { extractProviderId, resendSendError } from './resend-result.ts'

// ===========================================================================
// (1) resendSendError — the REAL pure decision.
// ===========================================================================

Deno.test('resendSendError: 429 rate_limit error object is a FAILURE (returns message)', () => {
  const resp = { data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests' } }
  assertEquals(resendSendError(resp), 'Too many requests')
})

Deno.test('resendSendError: 422 validation error object is a FAILURE', () => {
  const resp = { data: null, error: { name: 'validation_error', message: 'Invalid `to` field' } }
  assertEquals(resendSendError(resp), 'Invalid `to` field')
})

Deno.test('resendSendError: error object without a message still fails (generic text)', () => {
  assertEquals(resendSendError({ data: null, error: { name: 'application_error' } }), 'resend api error')
})

Deno.test('resendSendError: string error is a FAILURE', () => {
  assertEquals(resendSendError({ data: null, error: 'domain not verified' }), 'domain not verified')
})

Deno.test('resendSendError: empty-string error still fails (generic text, never treated as success)', () => {
  assertEquals(resendSendError({ data: null, error: '' }), 'resend api error')
})

Deno.test('resendSendError: accepted send (data.id, error null) is SUCCESS (null)', () => {
  assertEquals(resendSendError({ data: { id: 'msg_123' }, error: null }), null)
})

Deno.test('resendSendError: accepted send with error omitted is SUCCESS (null)', () => {
  assertEquals(resendSendError({ data: { id: 'msg_123' } }), null)
})

Deno.test('resendSendError: junk / non-object input does not throw and is treated as success', () => {
  assertEquals(resendSendError(null), null)
  assertEquals(resendSendError(undefined), null)
  assertEquals(resendSendError('weird'), null)
})

// ===========================================================================
// (2) extractProviderId — only present on an accepted send.
// ===========================================================================

Deno.test('extractProviderId: reads data.id on an accepted send', () => {
  assertEquals(extractProviderId({ data: { id: 'msg_abc' }, error: null }), 'msg_abc')
})

Deno.test('extractProviderId: null on an error response (data null)', () => {
  assertEquals(extractProviderId({ data: null, error: { message: 'x' } }), null)
})

// ===========================================================================
// (3) WIRING mirror of notify/index.ts's send branch — pins the corrected
//     control flow over the REAL resendSendError. Kept in sync with index.ts:
//       const resp = await resend.emails.send(...)
//       const sendErr = resendSendError(resp)
//       if (sendErr) throw new Error(sendErr)   // -> catch: record FAILURE
//       emailStatus = 'sent'; stamp id; record SUCCESS; insert 'email' row
// ===========================================================================

interface Effects {
  emailStatus: 'sent' | 'skipped' | 'error'
  recorded: Array<{ success: boolean; error?: string }>
  emailAuditInserted: boolean
  providerStamped: string | null
}

/** Faithful mirror of the try/catch send branch in notify/index.ts. */
function runSendBranch(resp: unknown, isRetry = false): Effects {
  const eff: Effects = { emailStatus: 'skipped', recorded: [], emailAuditInserted: false, providerStamped: null }
  const outboxId = 'outbox_1'
  try {
    const sendErr = resendSendError(resp)
    if (sendErr) throw new Error(sendErr)
    eff.emailStatus = 'sent'
    const providerId = extractProviderId(resp)
    if (outboxId && providerId) eff.providerStamped = providerId
    if (outboxId) eff.recorded.push({ success: true })
    if (!isRetry) eff.emailAuditInserted = true
  } catch (e) {
    eff.emailStatus = 'error'
    if (outboxId) eff.recorded.push({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
  return eff
}

Deno.test('WIRING: a 429 error response records a FAILED attempt, NOT success (no email lost)', () => {
  const eff = runSendBranch({ data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests' } })
  assertEquals(eff.emailStatus, 'error')
  assertEquals(eff.recorded, [{ success: false, error: 'Too many requests' }])
  assert(!eff.emailAuditInserted, 'a failed send must not insert a false email audit row')
  assertEquals(eff.providerStamped, null, 'no provider id is stamped on a failed send')
})

Deno.test('WIRING: an accepted send records SUCCESS, stamps id, inserts the email row', () => {
  const eff = runSendBranch({ data: { id: 'msg_ok' }, error: null })
  assertEquals(eff.emailStatus, 'sent')
  assertEquals(eff.recorded, [{ success: true }])
  assert(eff.emailAuditInserted)
  assertEquals(eff.providerStamped, 'msg_ok')
})

Deno.test('WIRING: a retry re-fire of an error response records failure but no audit row', () => {
  const eff = runSendBranch({ data: null, error: { message: 'quota exceeded' } }, /* isRetry */ true)
  assertEquals(eff.emailStatus, 'error')
  assertEquals(eff.recorded, [{ success: false, error: 'quota exceeded' }])
  assert(!eff.emailAuditInserted, 'retries never insert the in-app email row regardless')
})
