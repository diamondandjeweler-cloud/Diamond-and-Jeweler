/**
 * resend-result — pure helpers for interpreting a Resend `emails.send()` response.
 *
 * Resend v3 (npm:resend@3.2.0) resolves API-level rejections — 429 rate_limit,
 * 422 validation, 403 domain-not-verified, 5xx — to `{ data: null, error }`
 * WITHOUT throwing. notify must therefore inspect the RESOLVED `error` field:
 * treating a non-null error as a success records a false terminal 'sent' in the
 * B4 outbox (migration 0200), which `claim_notification_retry_batch` never
 * re-fires, silently losing the email and defeating the whole retry loop
 * (findings notifications-1 / fresh-commits-1 / split-state-1).
 *
 * Extracted so it is unit-testable: notify/index.ts calls `serve(...)` at module
 * load (binds a port on import) and cannot be imported into a hermetic test —
 * the same constraint the sibling `_shared/billplz.ts` helper works around.
 */

/**
 * Returns a human-readable error message if the Resend response represents an
 * API-level FAILURE (non-null `error`), or null if the send was accepted.
 *
 * A non-null error of ANY shape (string, `{ message }`, or an opaque object) is
 * treated as a failure — failing safe toward "retry" rather than silently
 * dropping the email.
 */
export function resendSendError(resp: unknown): string | null {
  if (resp && typeof resp === 'object') {
    const err = (resp as { error?: unknown }).error
    if (err !== null && err !== undefined) {
      if (typeof err === 'string') return err.length > 0 ? err : 'resend api error'
      if (typeof err === 'object') {
        const msg = (err as { message?: unknown }).message
        if (typeof msg === 'string' && msg.length > 0) return msg
      }
      return 'resend api error'
    }
  }
  return null
}

/**
 * Extract the Resend message id from a send() response. Only present on an
 * accepted send (`data.id`); null on any error/empty response.
 */
export function extractProviderId(resp: unknown): string | null {
  if (resp && typeof resp === 'object') {
    const data = (resp as { data?: { id?: unknown } | null }).data
    if (data && typeof data.id === 'string' && data.id.length > 0) return data.id
  }
  return null
}
