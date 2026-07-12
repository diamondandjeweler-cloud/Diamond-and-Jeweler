/**
 * award-points — pure request validation (finding money-2).
 *
 * Extracted so it is hermetically testable: award-points/index.ts calls
 * `serve(...)` at module load (binds a port on import) and cannot be imported
 * into a unit test.
 *
 * SECURITY INVARIANT (money-2): EVERY match-lifecycle event REQUIRES a match_id.
 * All four CONFIG_KEY events are per-match, and the downstream participation
 * check + server-derived idempotency key (`${event_type}:${match_id}`) are both
 * gated on match_id. Previously only `end_review` was forced to carry match_id;
 * the other three (accept_interview / reject_with_reason / interviewer_rejects)
 * could be called with a bare caller-supplied idempotency_key and NO match_id,
 * which skipped participation verification and let a talent/HM self-credit
 * unbounded Diamond Points by sending a fresh idempotency_key on each call
 * (point farming of a currency that buy-points sells for real RM). Requiring
 * match_id for all four closes the farming path.
 */
export type EventType =
  | 'reject_with_reason'
  | 'accept_interview'
  | 'interviewer_rejects'
  | 'end_review'

export const CONFIG_KEY: Record<EventType, string> = {
  reject_with_reason:  'earn_reject_with_reason',
  accept_interview:    'earn_accept_interview',
  interviewer_rejects: 'earn_interviewer_rejects',
  end_review:          'earn_end_review',
}

export interface AwardPointsBody {
  event_type?: EventType
  match_id?: string
}

/**
 * Validate the request shape. Returns an HTTP error (status + message) when the
 * request is invalid, or null when it is well-formed. A well-formed request
 * ALWAYS carries a recognised event_type AND a match_id.
 */
export function validateAwardPointsRequest(
  body: AwardPointsBody,
): { status: number; error: string } | null {
  if (!body.event_type || !CONFIG_KEY[body.event_type]) {
    return { status: 400, error: `Unknown event_type: ${body.event_type}` }
  }
  if (!body.match_id) {
    // Mandatory for ALL event types: match_id is what makes the idempotency key
    // server-derived and enables participation verification. Without it a caller
    // could farm points with fresh idempotency keys.
    return { status: 400, error: 'match_id required to verify participation' }
  }
  return null
}
