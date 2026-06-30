/**
 * Shared error-telemetry helper for Edge Functions.
 *
 * Edge functions run outside the browser, so the client-side Sentry never sees
 * their failures — historically they were swallowed into console.error only.
 * reportError ships a compact error envelope to an external sink so on-call can
 * see edge failures.
 *
 * Destination is the SENTRY_DSN_EDGE env var, falling back to EDGE_ERROR_WEBHOOK.
 * When neither is set this is a NO-OP. It NEVER throws — its entire body is
 * wrapped in try/catch — so callers can `await reportError(...)` inside a catch
 * block without any risk of masking the original error or changing control flow.
 */

/** POST a compact JSON error envelope to the configured sink. No-op when unset, never throws. */
export async function reportError(err: unknown, ctx: Record<string, unknown>): Promise<void> {
  try {
    const sink = Deno.env.get('SENTRY_DSN_EDGE') ?? Deno.env.get('EDGE_ERROR_WEBHOOK')
    if (!sink) return

    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack ?? null : null

    await fetch(sink, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stack, ctx, ts: new Date().toISOString() }),
    })
  } catch (e) {
    // Telemetry must never crash or alter the calling function.
    console.error('[observe] reportError failed:', e)
  }
}
