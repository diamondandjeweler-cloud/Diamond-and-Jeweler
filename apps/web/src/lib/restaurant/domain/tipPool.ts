// Pure, framework-free tip-pool payroll math (restaurant domain layer — no
// Supabase/React imports). Extracted verbatim from `store.distributeTipPool`
// so the split preserves every rounding and guard byte-for-byte; the DAL keeps
// the reads (orders + timesheets), the employee-name join, and the audit writes.

/** Only the `tip` column matters to the split; other order fields are ignored. */
export interface TipOrder {
  tip: number | null
}

/**
 * A timesheet row. `total_hours`, when present, is authoritative; otherwise the
 * span is derived from clock_in → clock_out (open shifts fall back to `now`).
 */
export interface TipTimesheet {
  employee_id: string
  clock_in: string
  clock_out: string | null
  total_hours: number | null
}

/** One employee's share of the pool, weighted by clocked hours. */
export interface TipAllocation {
  employee_id: string
  hours: number
  share: number
}

export interface TipPoolResult {
  total: number
  totalHours: number
  allocations: TipAllocation[]
}

/**
 * Sum every `tip`, weight each employee's cut by the hours they clocked in the
 * window, and round to cents — reproducing exactly the arithmetic
 * `store.distributeTipPool` used before this was hoisted:
 *
 *   total      = Σ Number(o.tip ?? 0)
 *   hours[e]   = Σ (total_hours ?? (clock_out ?? now) − clock_in in hours)
 *   totalHours = Σ hours[e]
 *   guard: total<=0 || totalHours<=0 || employees===0  ⇒ empty allocations
 *   hours  = Math.round(h * 100) / 100
 *   share  = Math.round(total * (h / totalHours) * 100) / 100
 *
 * `now` defaults to `Date.now()` so production behaviour is unchanged; tests pass
 * a fixed value to make open-shift derivation deterministic. Allocations are
 * emitted in first-clock-in insertion order (the same order the DAL then joins
 * names onto and writes audit rows for).
 */
export function computeTipAllocations(
  orders: readonly TipOrder[] | null | undefined,
  timesheets: readonly TipTimesheet[] | null | undefined,
  now: number = Date.now(),
): TipPoolResult {
  const total = (orders ?? []).reduce((s, o) => s + Number(o.tip ?? 0), 0)

  // Hours per employee (counts any role for now — caller can filter)
  const hoursMap = new Map<string, number>()
  for (const t of timesheets ?? []) {
    const h = t.total_hours != null
      ? Number(t.total_hours)
      : ((new Date(t.clock_out ?? now).getTime() - new Date(t.clock_in).getTime()) / 3600000)
    hoursMap.set(t.employee_id, (hoursMap.get(t.employee_id) ?? 0) + h)
  }
  const totalHours = Array.from(hoursMap.values()).reduce((s, h) => s + h, 0)
  if (total <= 0 || totalHours <= 0 || hoursMap.size === 0) {
    return { total, totalHours, allocations: [] }
  }

  const allocations = Array.from(hoursMap.entries()).map(([id, h]) => ({
    employee_id: id,
    hours: Math.round(h * 100) / 100,
    share: Math.round((total * (h / totalHours)) * 100) / 100,
  }))

  return { total, totalHours, allocations }
}
