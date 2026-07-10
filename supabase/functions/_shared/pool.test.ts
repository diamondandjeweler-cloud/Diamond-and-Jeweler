import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { allSettledBounded } from './pool.ts'

Deno.test('processes every item and preserves index alignment', async () => {
  const items = [1, 2, 3, 4, 5]
  const results = await allSettledBounded(items, 2, (n) => Promise.resolve(n * 10))
  assertEquals(results.length, 5)
  results.forEach((r, i) => {
    assertEquals(r.status, 'fulfilled')
    assertEquals((r as PromiseFulfilledResult<number>).value, items[i] * 10)
  })
})

Deno.test('never exceeds the concurrency limit', async () => {
  let inFlight = 0
  let peak = 0
  await allSettledBounded(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise((res) => setTimeout(res, 5))
    inFlight--
  })
  assertEquals(peak <= 3, true)
})

Deno.test('a rejection becomes a rejected entry and the pool keeps draining', async () => {
  const seen: number[] = []
  const results = await allSettledBounded([0, 1, 2, 3], 2, async (n) => {
    seen.push(n)
    if (n === 1) throw new Error('boom')
    return n
  })
  assertEquals(seen.length, 4)                    // all items still processed
  assertEquals(results[1].status, 'rejected')
  assertEquals(results[0].status, 'fulfilled')
  assertEquals(results[3].status, 'fulfilled')
})

Deno.test('empty input resolves to empty results', async () => {
  const results = await allSettledBounded([], 4, () => Promise.resolve(1))
  assertEquals(results, [])
})
