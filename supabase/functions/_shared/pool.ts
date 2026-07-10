/**
 * allSettledBounded — Promise.allSettled with a concurrency cap.
 *
 * Runs `worker` over every item, at most `limit` in flight at once, and
 * resolves with index-aligned settled results (never rejects — a worker
 * rejection becomes a 'rejected' entry and the pool keeps draining, exactly
 * like Promise.allSettled). Used by cron/edge jobs to convert per-row serial
 * loops into bounded fan-out without saturating the shared PostgREST pool.
 */
export async function allSettledBounded<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length)
  let next = 0
  const width = Math.max(1, Math.min(limit, items.length))
  const runners = Array.from({ length: width }, async () => {
    while (true) {
      const idx = next++
      if (idx >= items.length) return
      try {
        results[idx] = { status: 'fulfilled', value: await worker(items[idx], idx) }
      } catch (reason) {
        results[idx] = { status: 'rejected', reason }
      }
    }
  })
  await Promise.all(runners)
  return results
}
