/**
 * useQuery — a thin, opinionated wrapper over SWR's `useSWR` that gives every
 * read view in the app the same query-cache behaviour for free:
 *
 *   - request **deduplication** (concurrent callers with the same key share one
 *     in-flight fetch),
 *   - **stale-while-revalidate** (cached data renders instantly while a fresh
 *     fetch runs in the background),
 *   - **focus refetch** (re-warm on window/tab focus — the app already does
 *     this manually in several places; SWR centralises it),
 *   - **keepPreviousData** (when the key changes, the previous result stays on
 *     screen until the new one resolves — no flash of empty/skeleton on
 *     pagination or filter changes).
 *
 * Intended pattern — wrap a repository / read function and key it by a stable
 * string (or a tuple). You get back `{ data, error, isLoading, mutate }`:
 *
 *   const { data, error, isLoading, mutate } = useQuery(
 *     userId ? ['my-roles', userId] : null,   // null key === disabled (gate on auth)
 *     () => fetchMyRoles(userId!),
 *   )
 *
 * Keying conventions:
 *   - Use a **stable, serialisable** key that uniquely identifies the result:
 *     a string, or an array tuple like `['admin-audit', page, actionFilter]`.
 *     Changing the key triggers a refetch; identical keys dedupe and share
 *     cache.
 *   - Pass a **`null` key to disable** the query (SWR convention). This is how
 *     callers gate on auth / required params — the fetcher won't run and the
 *     hook stays in its initial (non-loading-once-resolved) state.
 *
 * `mutate()` revalidates (or optimistically updates) the cached entry — use it
 * for "Refresh" buttons and after writes that change what the query returns.
 *
 * Defaults below are tuned for this app; pass `opts` to override per call.
 */
import useSWR, { type SWRConfiguration, type SWRResponse, type Key } from 'swr'

/**
 * `key`     — stable string / tuple identifying the result, or `null` to disable.
 * `fetcher` — async function returning the data. Called when `key` is non-null.
 * `opts`    — optional SWR overrides (merged over the app defaults below).
 */
export function useQuery<T = unknown, E = unknown>(
  key: Key,
  fetcher: (() => Promise<T>) | null,
  opts?: SWRConfiguration<T, E>,
): {
  data: T | undefined
  error: E | undefined
  /** True only on the first load (no data yet). */
  isLoading: boolean
  /**
   * True whenever a request is in flight — including background revalidations
   * after data is already present. Use this (not `isLoading`) when a caller
   * wants to surface a spinner/skeleton on every refetch, e.g. paginated lists
   * that previously reset to a skeleton on each page change.
   */
  isValidating: boolean
  mutate: SWRResponse<T, E>['mutate']
} {
  const res = useSWR<T, E>(
    key,
    // SWR calls the fetcher with the key as its argument; our callers close
    // over the params they need, so we ignore the passed key and just invoke.
    fetcher ? () => fetcher() : null,
    {
      // ~5s dedup: rapid re-mounts / sibling components sharing a key collapse
      // into a single network round-trip.
      dedupingInterval: 5000,
      // The app already re-warms data on focus; centralise that here.
      revalidateOnFocus: true,
      // Keep the last result visible across key changes (pagination/filters).
      keepPreviousData: true,
      // No background polling — reads refresh on focus / explicit mutate only.
      refreshInterval: 0,
      ...opts,
    },
  )

  return {
    data: res.data,
    error: res.error,
    isLoading: res.isLoading,
    isValidating: res.isValidating,
    mutate: res.mutate,
  }
}
