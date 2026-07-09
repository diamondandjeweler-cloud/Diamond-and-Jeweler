/**
 * Restaurant data access — PAYROLL (tip pool distribution).
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { restaurantDb as db } from '../client'
import { computeTipAllocations } from '../domain/tipPool'

/**
 * Tip pool distribution at shift close.
 * Sums all `tip` from orders in the shift window, splits proportionally
 * among waiters who clocked any time during the window, weighted by hours.
 * Returns the breakdown — caller can print or write to a payroll-prep table.
 */
export async function distributeTipPool(branchId: string, sinceISO: string): Promise<{
  total: number
  allocations: Array<{ employee_id: string; name: string; hours: number; share: number }>
}> {
  const [{ data: orders }, { data: ts }] = await Promise.all([
    db.from('orders').select('tip, waiter_id, created_at').eq('branch_id', branchId).gte('created_at', sinceISO).in('status', ['paid','closed']),
    db.from('timesheet').select('employee_id, clock_in, clock_out, total_hours').eq('branch_id', branchId).gte('clock_in', sinceISO),
  ])
  // Pure split (total, per-employee hours + share, cent-rounding, empty guards).
  const { total, totalHours, allocations: rawAllocations } = computeTipAllocations(orders, ts)
  if (rawAllocations.length === 0) {
    return { total, allocations: [] }
  }

  const empIds = rawAllocations.map((a) => a.employee_id)
  const { data: emps } = await db.from('employee').select('id, name').in('id', empIds)
  const nameOf = new Map(((emps ?? []) as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]))

  // Join employee names onto the computed shares (name lookup is a DB read).
  const allocations = rawAllocations.map((a) => ({
    employee_id: a.employee_id,
    name: nameOf.get(a.employee_id) ?? '—',
    hours: a.hours,
    share: a.share,
  }))

  // Audit log entry per allocation
  for (const a of allocations) {
    await db.from('audit_log').insert({
      branch_id: branchId, action: 'tip_pool_distributed',
      entity_type: 'employee', entity_id: a.employee_id,
      reason: `Tip share ${a.share} (${a.hours}h)`,
      new_value: { total_pool: total, total_hours: totalHours, share: a.share },
    })
  }

  return { total, allocations }
}
