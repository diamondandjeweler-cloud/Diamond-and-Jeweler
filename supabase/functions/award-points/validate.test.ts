/**
 * award-points — request-validation tests (finding money-2)
 *
 * Run in CI's edge-tests job: deno test --allow-all --no-check supabase/functions/
 * Hermetic — no network, no DB, no secrets (only std/assert).
 *
 * REGRESSION GUARD (money-2): the point-farming hole was that only `end_review`
 * required a match_id, so accept_interview / reject_with_reason /
 * interviewer_rejects could be called with a bare caller-supplied idempotency_key
 * and NO match_id — skipping participation verification and letting a talent/HM
 * self-credit unbounded Diamond Points with a fresh key each call. These tests
 * assert that ALL FOUR event types now require match_id (400 without it), which
 * FAILS against the old `event_type === 'end_review' && !match_id` guard and
 * PASSES against the fixed validateAwardPointsRequest.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { type EventType, validateAwardPointsRequest } from './validate.ts'

const ALL_EVENTS: EventType[] = [
  'accept_interview',
  'reject_with_reason',
  'interviewer_rejects',
  'end_review',
]

Deno.test('EVERY event type is rejected (400) when match_id is absent — closes the farming path', () => {
  for (const event_type of ALL_EVENTS) {
    // No match_id, no way to supply a bare idempotency key any more.
    const res = validateAwardPointsRequest({ event_type })
    assertEquals(
      res,
      { status: 400, error: 'match_id required to verify participation' },
      `${event_type} must require match_id`,
    )
  }
})

Deno.test('the three previously-open events specifically fail without match_id (regression pin)', () => {
  for (const event_type of ['accept_interview', 'reject_with_reason', 'interviewer_rejects'] as EventType[]) {
    const res = validateAwardPointsRequest({ event_type })
    assert(res !== null, `${event_type} without match_id must NOT be accepted`)
    assertEquals(res?.status, 400)
  }
})

Deno.test('a well-formed request (event_type + match_id) passes validation', () => {
  for (const event_type of ALL_EVENTS) {
    assertEquals(
      validateAwardPointsRequest({ event_type, match_id: 'match_1' }),
      null,
      `${event_type} with match_id must pass`,
    )
  }
})

Deno.test('an unknown/absent event_type is rejected (400) even with a match_id', () => {
  assertEquals(
    validateAwardPointsRequest({ event_type: 'bogus' as EventType, match_id: 'm1' }),
    { status: 400, error: 'Unknown event_type: bogus' },
  )
  assertEquals(
    validateAwardPointsRequest({ match_id: 'm1' }),
    { status: 400, error: 'Unknown event_type: undefined' },
  )
})

Deno.test('unknown event_type is checked BEFORE match_id (stable error precedence)', () => {
  // No event_type and no match_id → the event_type error wins.
  assertEquals(
    validateAwardPointsRequest({}),
    { status: 400, error: 'Unknown event_type: undefined' },
  )
})
