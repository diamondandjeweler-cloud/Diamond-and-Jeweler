import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * restaurant-3: refundPayment must SURFACE a failed DB write instead of
 * swallowing it and reporting a phantom success (which left the payment
 * 'completed', points never clawed back, while the audit log claimed a refund).
 *
 * The restaurant client is mocked so the update result can be driven per-test.
 */
interface UpdateResult {
  data: unknown[] | null
  error: { message: string } | null
}

interface Chain {
  update(patch: Record<string, unknown>): Chain
  eq(col: string, val: unknown): Chain
  select(): Promise<UpdateResult>
}

const h = vi.hoisted(() => ({
  result: { data: null as unknown[] | null, error: null as { message: string } | null },
  patch: null as Record<string, unknown> | null,
  eqCalls: [] as Array<[string, unknown]>,
}))

vi.mock('../client', () => {
  const makeChain = (): Chain => {
    const chain: Chain = {
      update(patch) { h.patch = patch; return chain },
      eq(col, val) { h.eqCalls.push([col, val]); return chain },
      select() { return Promise.resolve(h.result) },
    }
    return chain
  }
  return { restaurantDb: { from: () => makeChain() } }
})

import { refundPayment } from './payments'

beforeEach(() => {
  h.result = { data: null, error: null }
  h.patch = null
  h.eqCalls = []
})

describe('restaurant data — refundPayment', () => {
  it('resolves and refunds only a still-completed row when the update succeeds', async () => {
    h.result = { data: [{ id: 'p1' }], error: null }
    await expect(refundPayment('p1', 'emp1', 'customer changed mind')).resolves.toBeUndefined()
    expect(h.patch).toMatchObject({ status: 'refunded', refunded_by: 'emp1', refund_reason: 'customer changed mind' })
    // Guards double-refund by only touching a completed row.
    expect(h.eqCalls).toContainEqual(['id', 'p1'])
    expect(h.eqCalls).toContainEqual(['status', 'completed'])
  })

  it('THROWS when the DB write returns an error (no phantom success)', async () => {
    h.result = { data: null, error: { message: 'RLS denied' } }
    await expect(refundPayment('p1', 'emp1', 'x')).rejects.toThrow('RLS denied')
  })

  it('THROWS when zero rows matched (already refunded / RLS-filtered / not found)', async () => {
    h.result = { data: [], error: null }
    await expect(refundPayment('p1', 'emp1', 'x')).rejects.toThrow(/did not apply/i)
  })
})
