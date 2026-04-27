import type { SWRConfiguration } from 'swr'

/**
 * App-wide SWR defaults — cache-first ("show stale, revalidate underneath")
 * Components that need different behaviour can override per-call.
 */
export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateIfStale: true,
  revalidateOnReconnect: true,
  dedupingInterval: 30_000,
  focusThrottleInterval: 60_000,
  shouldRetryOnError: true,
  errorRetryCount: 2,
  errorRetryInterval: 1500,
  keepPreviousData: true,
}
