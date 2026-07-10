// In-tab serializing lock (processLock-equivalent) for supabase-js auth.
//
// We previously used a NO-OP lock to silence the cross-tab "Lock was released
// because another request stole it" warnings that navigator.locks emits. But a
// no-op lock removes ALL serialization — and the assumption that "auto-refresh
// is idempotent" is FALSE: refresh tokens are single-use, so two concurrent
// refreshes (e.g. the auto-refresh tick racing a getSession()/refreshSession()
// call) consume the same refresh token and ONE FAILS. The failed refresh leaves
// an expired/invalid access token, so subsequent queries 401 ("JWT expired") and
// the app appears frozen — and isHM-style lookups silently return 0 rows.
//
// This lock serializes auth operations WITHIN the tab (chaining by lock name),
// which prevents the concurrent-refresh collision, while NOT using
// navigator.locks (so the cross-tab "stolen" warnings stay gone). Equivalent to
// supabase-js's processLock, implemented inline since it isn't re-exported from
// @supabase/supabase-js.

const lockChains = new Map<string, Promise<unknown>>()

// Stock custom-lock contract (supabase-js): when the lock cannot be ACQUIRED
// within acquireTimeout ms, throw an error with `isAcquireTimeout = true` —
// GoTrueClient treats it as a benign "skip this tick" on the auto-refresh path
// (which acquires with acquireTimeout 0). We previously discarded the timeout,
// so one hung auth op (e.g. a refresh fetch stalled by a dead network) wedged
// every later auth call behind it forever ("app frozen", isHM 0 rows).
export class InTabLockAcquireTimeoutError extends Error {
  readonly isAcquireTimeout = true
}

export function inTabLock<R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const prev = lockChains.get(name) ?? Promise.resolve()
  let abandoned = false
  let acquired = false
  // Next link in the chain: run fn once the previous holder settles (success OR
  // failure) — unless this caller already gave up waiting. A timed-out caller
  // leaves a no-op link, so later acquirers still serialize behind the REAL
  // holder and can never run concurrently with it (refresh tokens are
  // single-use; the timeout must not re-create the collision this lock
  // prevents — the acquirer stops waiting, the holder is never aborted).
  const runFn = () => {
    if (abandoned) return undefined as unknown as R
    acquired = true
    return fn()
  }
  const run = prev.then(runFn, runFn)
  // Keep the chain alive but swallow rejections so one failure doesn't poison
  // the next acquirer.
  lockChains.set(name, run.then(() => undefined, () => undefined))

  // Negative timeout = wait indefinitely (previous behavior for all callers).
  if (acquireTimeout < 0) return run

  return new Promise<R>((resolve, reject) => {
    // The timeout guards ACQUISITION only — once fn has started, its own
    // duration is not bounded here (stock processLock semantics).
    const timer = setTimeout(() => {
      if (!acquired) {
        abandoned = true
        reject(new InTabLockAcquireTimeoutError(
          `Failed to acquire in-tab lock "${name}" within ${acquireTimeout}ms`,
        ))
      }
    }, acquireTimeout)
    run.then(
      (v) => { clearTimeout(timer); if (!abandoned) resolve(v) },
      (e) => { clearTimeout(timer); if (!abandoned) reject(e) },
    )
  })
}
