/**
 * usePolling — a small, self-cleaning polling hook for the always-on restaurant
 * screens (floor, KDS, order tracker, purchasing status, …).
 *
 * It replaces raw `setInterval(fetch, ms)` loops that otherwise run full-tilt
 * forever — even in a backgrounded tab or a kiosk nobody is touching. It:
 *
 *   - runs `fn` **immediately**, then on an interval of `intervalMs`;
 *   - **pauses** while the tab is hidden (`document.hidden`) and **resumes** —
 *     firing `fn` once immediately — the moment it becomes visible again, so a
 *     screen brought back to the foreground always shows fresh data;
 *   - applies a **binary idle backoff**: once there has been no user interaction
 *     (pointer / key / touch) for `idleAfterMs`, the interval jumps to
 *     `maxIntervalMs` and snaps straight back to the base interval the instant
 *     the user interacts (or the tab is refocused) again;
 *   - cleans up its timer and all listeners on unmount (or when a dep changes).
 *
 * `fn` is kept in a ref, so callers can pass a fresh closure every render
 * without `useCallback` and without restarting the timer. `fn` receives an
 * `isActive()` probe — call it after every `await` and *before* any `setState`
 * so a run that outlived its effect (a dep changed mid-flight) can bail instead
 * of clobbering current state with the previous entity's data.
 *
 * Pass `opts.deps` for the values the fetch is keyed on (branch / order id): a
 * dep change re-runs the effect, which cancels any in-flight run and fires `fn`
 * immediately for the new key — this is what prevents stale overwrites.
 */
import { useEffect, useRef } from 'react'

export interface UsePollingOptions {
  /** Enable the idle backoff behaviour. Default: true. */
  idle?: boolean
  /** Idle time (ms) with no interaction before backoff kicks in. Default: 60000. */
  idleAfterMs?: number
  /** The backed-off interval once idle. Default: `max(intervalMs, 60000)`. */
  maxIntervalMs?: number
  /** Values the fetch is keyed on; a change restarts the poller + fires immediately. */
  deps?: unknown[]
}

export function usePolling(
  fn: (isActive: () => boolean) => void | Promise<void>,
  intervalMs: number,
  opts?: UsePollingOptions,
): void {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false   // effect torn down (unmount or dep change)
    let parked = false      // tab hidden — loop suspended
    let running = false     // a tick is currently awaiting fn
    let lastActivity = Date.now()

    // Still the live run? Callers check this after each await, before setState,
    // so a run whose effect was torn down mid-flight bails instead of writing
    // the previous key's data over the current one.
    const isActive = () => !cancelled

    const nextDelay = () => {
      const idle = opts?.idle !== false
      return idle && Date.now() - lastActivity >= (opts?.idleAfterMs ?? 60000)
        ? (opts?.maxIntervalMs ?? Math.max(intervalMs, 60000))
        : intervalMs
    }

    const schedule = () => {
      if (cancelled || parked) return
      timer = setTimeout(tick, nextDelay())
    }

    const tick = async () => {
      if (cancelled) return
      running = true
      timer = undefined
      try {
        await fnRef.current(isActive)
      } finally {
        running = false
        schedule()
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        parked = true
        if (timer) { clearTimeout(timer); timer = undefined }
      } else {
        if (!parked) return
        parked = false
        lastActivity = Date.now()
        // If a run is still in-flight, its finally → schedule resumes the loop;
        // starting a second tick here is exactly the double-poll bug we avoid.
        if (!running) void tick()
      }
    }

    const onInteract = () => { lastActivity = Date.now() }

    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('pointerdown', onInteract, { passive: true })
    document.addEventListener('keydown', onInteract, { passive: true })
    document.addEventListener('touchstart', onInteract, { passive: true })

    // Fire immediately on start, then begin the loop.
    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('pointerdown', onInteract)
      document.removeEventListener('keydown', onInteract)
      document.removeEventListener('touchstart', onInteract)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, opts?.idle, opts?.idleAfterMs, opts?.maxIntervalMs, ...(opts?.deps ?? [])])
}
