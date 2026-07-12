/**
 * notification-retry — re-fire outcome decision (finding notifications-3).
 *
 * The retry cron re-invokes `notify` over HTTP for each claimed outbox row. The
 * BUG being guarded: the fetch result was discarded and `refired++` counted
 * unconditionally. A non-2xx from notify (403 when the service key is
 * rotated/unset, 404 for a deleted target user, 500 from the serve wrapper) does
 * NOT throw, so it skipped the catch — record_notification_attempt was never
 * called, the claimed row (already flipped to 'sending', one attempt spent) sat
 * stranded until the coarse stale-scan re-claimed it, and the failure counted as
 * a success.
 *
 * NOTE: `notify` returns HTTP 200 even when it internally records a Resend send
 * failure (it records the attempt itself and answers ok). So `res.ok` here is a
 * clean signal that notify NEVER reached its own recording logic — exactly the
 * gap this decision covers, with no double-recording of the Resend-failure path.
 *
 * Extracted so it is hermetically testable: index.ts serve()s a port on import.
 */

/**
 * Given the re-fire HTTP response, return null if the row should be counted as
 * successfully re-fired, or an error message to record as a FAILED attempt
 * (advancing the backoff) when notify answered non-2xx.
 */
export function refireOutcome(res: { ok: boolean; status: number }): string | null {
  return res.ok ? null : `notify returned ${res.status}`
}
