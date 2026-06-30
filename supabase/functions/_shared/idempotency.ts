import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * Request-level idempotency for the money-path POSTs.
 *
 * Backed by public.request_dedup (migration 0165). Protects the
 * bill-creation / grant body from being run twice for the SAME client
 * `Idempotency-Key` (double-click, retry-on-timeout). The DB-level CAS
 * guards inside each handler (award_points / redeem_points_for keys,
 * `.eq('payment_status','pending')` flips) remain the authoritative
 * protection against a double GRANT — this only de-dupes the cheaper,
 * non-idempotent bill-creation step and replays the first response.
 *
 * Contract:
 *   - If `key` is falsy, no header was sent → just run `fn()` (no store).
 *   - Otherwise INSERT the key (on conflict do nothing). If the row
 *     already existed AND has a stored response, replay it. Otherwise
 *     run `fn()`, persist its JSON response, and return it.
 *
 * Fail-open: any error talking to the dedup store is logged and we fall
 * through to running `fn()`. Availability over strictness — the DB CAS
 * guards still prevent a true double-grant even if dedup is unavailable.
 *
 * NOTE: `fn()` must return a value that is JSON-serialisable so the
 * response can be persisted and faithfully replayed.
 */
export async function withIdempotency<T>(
  db: SupabaseClient,
  key: string | null | undefined,
  userId: string | null | undefined,
  endpoint: string,
  fn: () => Promise<T>,
): Promise<T> {
  // No key supplied — nothing to de-dupe, run the body directly.
  if (!key) return await fn()

  // 1) Try to claim the key. `on conflict do nothing` → insert is a no-op
  //    when the key already exists, so the returned row tells us whether
  //    we are the first caller (row returned) or a replay (no row).
  let claimed = false
  try {
    const { data: inserted, error: insErr } = await db
      .from('request_dedup')
      .insert({ key, user_id: userId ?? null, endpoint })
      .select('key')
      .maybeSingle()
    if (insErr) {
      // Unique-violation (23505) means someone else already claimed it —
      // fall through to the replay read below. Any other error → fail open.
      if (insErr.code !== '23505') {
        console.error('withIdempotency: insert failed (failing open)', insErr)
        return await fn()
      }
    } else if (inserted) {
      claimed = true
    }
  } catch (e) {
    console.error('withIdempotency: insert threw (failing open)', e)
    return await fn()
  }

  // 2) If we did NOT claim the key, a prior request owns it. Replay its
  //    stored response when present; if the prior request hasn't stored
  //    one yet (in-flight) we conservatively run `fn()` rather than block.
  if (!claimed) {
    try {
      const { data: existing } = await db
        .from('request_dedup')
        .select('response, expires_at')
        .eq('key', key)
        .maybeSingle()
      const notExpired = !existing?.expires_at || new Date(existing.expires_at as string) > new Date()
      if (existing && existing.response != null && notExpired) {
        return existing.response as T
      }
    } catch (e) {
      console.error('withIdempotency: replay read threw (failing open)', e)
    }
    // No usable stored response — run the body but do NOT persist (we are
    // not the owning row), so we don't clobber the owner's eventual store.
    return await fn()
  }

  // 3) We own the key. Run the body and persist its response for replay.
  const result = await fn()
  try {
    await db
      .from('request_dedup')
      .update({ response: result as unknown as Record<string, unknown> })
      .eq('key', key)
  } catch (e) {
    // Never throw on a store failure — the caller already has a result.
    console.error('withIdempotency: response store failed (returning result)', e)
  }
  return result
}
