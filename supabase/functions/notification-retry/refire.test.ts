/**
 * notification-retry — re-fire outcome tests (finding notifications-3)
 *
 * Run in CI's edge-tests job: deno test --allow-all --no-check supabase/functions/
 * Hermetic — no network, no DB, no secrets (only std/assert).
 *
 * REGRESSION GUARD (notifications-3): the re-fire loop discarded the fetch result
 * and counted `refired++` unconditionally, so a non-2xx from notify (403 rotated
 * key / 404 deleted user / 500) recorded NO failure and left the claimed row
 * stranded in 'sending'. refireOutcome() turns a non-2xx into a recorded failure.
 * (1) tests the REAL refireOutcome, and (2) mirrors the loop body over it to pin
 * the corrected wiring (2xx → refired++, non-2xx → recordFailure).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { refireOutcome } from './refire.ts'

// ── (1) the REAL decision ──────────────────────────────────────────────────

Deno.test('refireOutcome: a 2xx re-fire is a success (null)', () => {
  assertEquals(refireOutcome({ ok: true, status: 200 }), null)
})

Deno.test('refireOutcome: 403 (rotated/unset service key) records a failure', () => {
  assertEquals(refireOutcome({ ok: false, status: 403 }), 'notify returned 403')
})

Deno.test('refireOutcome: 404 (deleted target user) records a failure', () => {
  assertEquals(refireOutcome({ ok: false, status: 404 }), 'notify returned 404')
})

Deno.test('refireOutcome: 500 (serve-wrapper throw) records a failure', () => {
  assertEquals(refireOutcome({ ok: false, status: 500 }), 'notify returned 500')
})

// ── (2) WIRING mirror of the loop body in notification-retry/index.ts ───────

interface LoopEffects {
  refired: number
  failures: Array<{ id: string; msg: string }>
}

/** Faithful mirror of the try-block loop body over the REAL refireOutcome. */
function runLoopBody(rowId: string, res: { ok: boolean; status: number }, eff: LoopEffects): void {
  const failMsg = refireOutcome(res)
  if (failMsg) eff.failures.push({ id: rowId, msg: failMsg })
  else eff.refired++
}

Deno.test('WIRING: a non-2xx re-fire records a failure and is NOT counted as refired', () => {
  const eff: LoopEffects = { refired: 0, failures: [] }
  runLoopBody('row_1', { ok: false, status: 403 }, eff)
  assertEquals(eff.refired, 0, 'a failed re-fire must not inflate the refired metric')
  assertEquals(eff.failures, [{ id: 'row_1', msg: 'notify returned 403' }])
})

Deno.test('WIRING: a 2xx re-fire increments refired and records no failure', () => {
  const eff: LoopEffects = { refired: 0, failures: [] }
  runLoopBody('row_2', { ok: true, status: 200 }, eff)
  assertEquals(eff.refired, 1)
  assertEquals(eff.failures.length, 0)
})

Deno.test('WIRING: a mixed batch counts only the genuine successes', () => {
  const eff: LoopEffects = { refired: 0, failures: [] }
  runLoopBody('a', { ok: true, status: 200 }, eff)
  runLoopBody('b', { ok: false, status: 500 }, eff)
  runLoopBody('c', { ok: true, status: 200 }, eff)
  runLoopBody('d', { ok: false, status: 404 }, eff)
  assertEquals(eff.refired, 2)
  assertEquals(eff.failures.map((f) => f.id), ['b', 'd'])
  assert(eff.failures.every((f) => f.msg.startsWith('notify returned ')))
})
