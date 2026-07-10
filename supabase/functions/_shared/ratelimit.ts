import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * Thrown by enforceRateLimit when the caller has exceeded their limit.
 * Callers catch this and return a 429 in their own error/CORS style,
 * surfacing `retryAfterSeconds` as the Retry-After response header.
 */
export class RateLimitError extends Error {
  /** Seconds until the rate-limit window resets (the window length). */
  retryAfterSeconds: number

  constructor(message = 'rate_limited', retryAfterSeconds = 3600) {
    super(message)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/**
 * Per-key, per-window rate limit backed by the DB function
 * public.check_and_increment_rate (migration 0150). Atomically increments
 * the counter for `key` and throws RateLimitError when the limit is exceeded.
 *
 * Fail-open by design: if the RPC errors (DB hiccup, missing function, etc.)
 * we log and return — availability over strictness. We only throw when the
 * function explicitly reports the call is not allowed (data === false).
 */
export async function enforceRateLimit(
  client: SupabaseClient,
  key: string,
  limit = 20,
  windowSeconds = 3600,
): Promise<void> {
  const { data, error } = await client.rpc('check_and_increment_rate', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    // Fail open — never block traffic on a rate-limiter outage.
    console.error('enforceRateLimit: rpc error (failing open)', error)
    return
  }

  if (data === false) {
    // check_and_increment_rate (0150) uses epoch-aligned buckets
    // (floor(epoch / window) * window), so the true wait is the remainder of
    // the current bucket — not the full window. Guard keeps it >= 1s.
    const remaining = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds)
    throw new RateLimitError('rate_limited', Math.max(1, remaining))
  }
}
