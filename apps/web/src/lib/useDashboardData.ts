import { useEffect, useState, useCallback } from 'react'
import { readDashCache, writeDashCache } from './dashboardCache'

/**
 * Generic per-page data loader with localStorage-backed snapshot.
 *
 *   const { data, loading, error, refresh } = useDashboardData<MyRow[]>(
 *     'my_roles',
 *     userId,
 *     async () => {
 *       const { data, error } = await supabase.from('roles').select('*').eq('hm_id', userId)
 *       if (error) throw error
 *       return data as MyRow[]
 *     },
 *   )
 *
 * Contract:
 *   - `data` is null until either (a) a cached snapshot hydrates synchronously
 *     on first render, or (b) the loader resolves.
 *   - On fetch error, the cached snapshot is PRESERVED — null never overwrites
 *     a previously-good value. This is the same defence-in-depth that
 *     useSession bootstrap uses.
 *   - Auto-retries up to 3 times on transient failures (3s/5s/10s back-off).
 *   - `refresh()` lets the caller force a re-fetch after mutations.
 *
 * Surface keys should be stable strings — use kebab/snake e.g. `my_roles`,
 * `admin_verification`. Passing a falsy userId yields a global cache entry
 * (used by admin panels that aren't per-user).
 */
export interface DashboardData<T> {
  data: T | null
  loading: boolean
  error: Error | null
  refresh: () => void
}

export interface UseDashboardDataOptions {
  /** Disable the localStorage snapshot (e.g. for PDPA-sensitive panels). */
  noCache?: boolean
  /** Override the default 3-step retry ladder. Empty array = no retries. */
  retryDelaysMs?: number[]
}

const DEFAULT_RETRIES = [3_000, 5_000, 10_000]

export function useDashboardData<T>(
  surface: string,
  userId: string | undefined | null,
  loader: () => Promise<T>,
  opts: UseDashboardDataOptions = {},
): DashboardData<T> {
  const { noCache = false, retryDelaysMs = DEFAULT_RETRIES } = opts
  // Lazy localStorage read on first render — cheap, synchronous, throws are
  // swallowed by readDashCache itself.
  const cached = useState<T | null>(() => (noCache ? null : readDashCache<T>(surface, userId)))[0]
  const [data, setData] = useState<T | null>(cached)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const timeouts: ReturnType<typeof setTimeout>[] = []

    async function runOnce(attempt: number): Promise<void> {
      try {
        setLoading(true)
        const fresh = await loader()
        if (cancelled) return
        setData(fresh)
        setError(null)
        if (!noCache && fresh != null) writeDashCache<T>(surface, userId, fresh)
      } catch (e) {
        if (cancelled) return
        const err = e instanceof Error ? e : new Error(String(e))
        setError(err)
        // Cache-preservation guard: never overwrite an existing snapshot with
        // null. Either the cache survives in `data` (untouched by setData),
        // or `data` is already null and stays that way.
        // Schedule the next retry if we have one queued.
        if (attempt < retryDelaysMs.length) {
          const delay = retryDelaysMs[attempt]!
          const t = setTimeout(() => {
            if (!cancelled) void runOnce(attempt + 1)
          }, delay)
          timeouts.push(t)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void runOnce(0)

    return () => {
      cancelled = true
      for (const t of timeouts) clearTimeout(t)
    }
    // surface + userId + tick are the resolution keys. The loader fn itself
    // is intentionally NOT a dep — callers typically pass an inline async
    // closure that would re-create every render and thrash the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, userId, tick])

  return { data, loading, error, refresh }
}
