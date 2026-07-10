import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { inTabLock, InTabLockAcquireTimeoutError } from './inTabLock'

// Deferred promise helper — lets a test play the role of a slow/hung holder.
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('inTabLock', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('serializes ops on the same lock name (fn2 waits for fn1)', async () => {
    const order: string[] = []
    const d1 = deferred<void>()
    const p1 = inTabLock('serialize-test', -1, async () => { order.push('fn1-start'); await d1.promise; order.push('fn1-end') })
    const p2 = inTabLock('serialize-test', -1, async () => { order.push('fn2') })
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['fn1-start'])   // fn2 must not have started
    d1.resolve()
    await Promise.all([p1, p2])
    expect(order).toEqual(['fn1-start', 'fn1-end', 'fn2'])
  })

  it('a failed holder does not poison the next acquirer', async () => {
    const boom = inTabLock('poison-test', -1, async () => { throw new Error('boom') })
    await expect(boom).rejects.toThrow('boom')
    await expect(inTabLock('poison-test', -1, async () => 'ok')).resolves.toBe('ok')
  })

  it('rejects acquisition with isAcquireTimeout when the holder is hung', async () => {
    const hung = deferred<void>()
    void inTabLock('timeout-test', -1, () => hung.promise)  // hung holder, never settles yet
    const ran = vi.fn(async () => 'never')
    const waiter = inTabLock('timeout-test', 100, ran)
    const assertion = expect(waiter).rejects.toMatchObject({ isAcquireTimeout: true })
    await vi.advanceTimersByTimeAsync(101)
    await assertion
    await expect(waiter).rejects.toBeInstanceOf(InTabLockAcquireTimeoutError)
    // The timed-out caller's fn must NEVER run — even after the holder finally
    // settles (running it late would collide with whatever acquired next).
    hung.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(ran).not.toHaveBeenCalled()
  })

  it('later acquirers still serialize behind the real holder after a timeout', async () => {
    const order: string[] = []
    const hung = deferred<void>()
    void inTabLock('chain-test', -1, async () => { order.push('holder-start'); await hung.promise; order.push('holder-end') })
    const timedOut = inTabLock('chain-test', 50, async () => { order.push('timed-out-fn') })
    const assertion = expect(timedOut).rejects.toMatchObject({ isAcquireTimeout: true })
    await vi.advanceTimersByTimeAsync(51)
    await assertion
    const p3 = inTabLock('chain-test', -1, async () => { order.push('fn3') })
    await vi.advanceTimersByTimeAsync(0)
    // Holder still running — fn3 must not have jumped the queue.
    expect(order).toEqual(['holder-start'])
    hung.resolve()
    await p3
    expect(order).toEqual(['holder-start', 'holder-end', 'fn3'])
  })

  it('acquireTimeout bounds acquisition only — a slow fn is not aborted', async () => {
    const result = inTabLock('slow-fn-test', 100, async () => {
      await new Promise((res) => setTimeout(res, 500))  // fn slower than the acquire timeout
      return 'done'
    })
    await vi.advanceTimersByTimeAsync(501)
    await expect(result).resolves.toBe('done')
  })

  it('acquireTimeout 0 acquires immediately on a free lock (auto-refresh tick path)', async () => {
    const result = inTabLock('free-lock-test', 0, async () => 'ticked')
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe('ticked')
  })
})
