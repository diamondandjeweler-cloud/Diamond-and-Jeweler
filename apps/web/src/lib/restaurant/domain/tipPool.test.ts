import { describe, it, expect } from 'vitest'
import { computeTipAllocations } from './tipPool'
import type { TipTimesheet } from './tipPool'

/**
 * P0 characterization net for the tip-pool payroll split. Pins the exact
 * cent-rounding, empty guards, and clock-hours-vs-total_hours logic BEFORE any
 * P6 server-side money re-architecture, so a regression is caught immediately.
 */
describe('restaurant domain — computeTipAllocations (tip pool split)', () => {
  it('empty guard: no tips → total 0, no allocations', () => {
    const ts: TipTimesheet[] = [{ employee_id: 'a', clock_in: '2026-07-09T00:00:00Z', clock_out: '2026-07-09T08:00:00Z', total_hours: 8 }]
    expect(computeTipAllocations([], ts)).toEqual({ total: 0, totalHours: 8, allocations: [] })
  })

  it('empty guard: tips present but nobody clocked → no allocations', () => {
    expect(computeTipAllocations([{ tip: 50 }], [])).toEqual({ total: 50, totalHours: 0, allocations: [] })
  })

  it('empty guard: total<=0 even with hours → no allocations', () => {
    const ts: TipTimesheet[] = [{ employee_id: 'a', clock_in: '2026-07-09T00:00:00Z', clock_out: '2026-07-09T04:00:00Z', total_hours: 4 }]
    expect(computeTipAllocations([{ tip: 0 }, { tip: null }], ts)).toEqual({ total: 0, totalHours: 4, allocations: [] })
  })

  it('null/undefined orders and timesheets coalesce to empty', () => {
    expect(computeTipAllocations(null, undefined)).toEqual({ total: 0, totalHours: 0, allocations: [] })
  })

  it('single waiter takes the whole pool', () => {
    const ts: TipTimesheet[] = [{ employee_id: 'a', clock_in: '2026-07-09T00:00:00Z', clock_out: '2026-07-09T08:00:00Z', total_hours: 8 }]
    const r = computeTipAllocations([{ tip: 100 }, { tip: 20.5 }], ts)
    expect(r.total).toBe(120.5)
    expect(r.totalHours).toBe(8)
    expect(r.allocations).toEqual([{ employee_id: 'a', hours: 8, share: 120.5 }])
  })

  it('multi split weighted by hours, cent-rounded (100 over 3h+6h)', () => {
    // a: 3h, b: 6h, total 9h; pool 100.
    // a share = round(100*(3/9)*100)/100 = round(3333.33)/100 = 33.33
    // b share = round(100*(6/9)*100)/100 = round(6666.67)/100 = 66.67
    const ts: TipTimesheet[] = [
      { employee_id: 'a', clock_in: 'x', clock_out: 'y', total_hours: 3 },
      { employee_id: 'b', clock_in: 'x', clock_out: 'y', total_hours: 6 },
    ]
    const r = computeTipAllocations([{ tip: 100 }], ts)
    expect(r.total).toBe(100)
    expect(r.totalHours).toBe(9)
    expect(r.allocations).toEqual([
      { employee_id: 'a', hours: 3, share: 33.33 },
      { employee_id: 'b', hours: 6, share: 66.67 },
    ])
    // Shares need not sum to the pool exactly — pinning the known residual.
    expect(r.allocations[0].share + r.allocations[1].share).toBe(100)
  })

  it('rounds hours to cents and accumulates duplicate employee rows', () => {
    const ts: TipTimesheet[] = [
      { employee_id: 'a', clock_in: 'x', clock_out: 'y', total_hours: 2.005 },
      { employee_id: 'a', clock_in: 'x', clock_out: 'y', total_hours: 1 },
    ]
    const r = computeTipAllocations([{ tip: 10 }], ts)
    // 2.005 + 1 = 3.005 → round(3.005*100)/100 = 3.01 (banker-free JS round)
    expect(r.allocations).toEqual([{ employee_id: 'a', hours: 3.01, share: 10 }])
    expect(r.totalHours).toBe(3.005)
  })

  it('derives hours from clock_in/clock_out span when total_hours is null', () => {
    const ts: TipTimesheet[] = [{ employee_id: 'a', clock_in: '2026-07-09T00:00:00Z', clock_out: '2026-07-09T05:30:00Z', total_hours: null }]
    const r = computeTipAllocations([{ tip: 40 }], ts)
    expect(r.totalHours).toBe(5.5)
    expect(r.allocations).toEqual([{ employee_id: 'a', hours: 5.5, share: 40 }])
  })

  it('open shift (clock_out null) uses the injected `now` for a deterministic span', () => {
    const now = new Date('2026-07-09T04:00:00Z').getTime()
    const ts: TipTimesheet[] = [{ employee_id: 'a', clock_in: '2026-07-09T00:00:00Z', clock_out: null, total_hours: null }]
    const r = computeTipAllocations([{ tip: 12 }], ts, now)
    expect(r.totalHours).toBe(4)
    expect(r.allocations).toEqual([{ employee_id: 'a', hours: 4, share: 12 }])
  })

  it('preserves first-clock-in insertion order of allocations', () => {
    const ts: TipTimesheet[] = [
      { employee_id: 'z', clock_in: 'x', clock_out: 'y', total_hours: 1 },
      { employee_id: 'a', clock_in: 'x', clock_out: 'y', total_hours: 1 },
      { employee_id: 'm', clock_in: 'x', clock_out: 'y', total_hours: 1 },
    ]
    const r = computeTipAllocations([{ tip: 3 }], ts)
    expect(r.allocations.map((a) => a.employee_id)).toEqual(['z', 'a', 'm'])
  })
})
