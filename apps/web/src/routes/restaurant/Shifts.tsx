import { useEffect, useState } from 'react'
import { Alert, Badge, Card, CardBody, EmptyState, Spinner, Stat } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import { supabase } from '../../lib/supabase'
import type { CashierShift, Employee } from '../../lib/restaurant/types'
import { listEmployees, listPayments } from '../../lib/restaurant/store'
import { MYR, shortDate, shortTime } from '../../lib/restaurant/format'

const db = supabase.schema('restaurant' as never) as unknown as ReturnType<typeof supabase.schema>

export default function Shifts() {
  const { branchId } = useRestaurant()
  const [shifts, setShifts] = useState<CashierShift[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [report, setReport] = useState<Record<string, { cash: number; card: number; qr: number; other: number; total: number }>>({})

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    void (async () => {
      setLoading(true); setErr(null)
      try {
        const [{ data, error }, emps] = await Promise.all([
          db.from('cashier_shift').select('*').eq('branch_id', branchId).order('opened_at', { ascending: false }),
          listEmployees(branchId),
        ])
        if (error) throw error
        if (!cancelled) { setShifts((data as CashierShift[] | null) ?? []); setEmployees(emps) }
      } catch (e) { if (!cancelled) setErr((e as Error).message) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [branchId])

  const loadReport = async (s: CashierShift) => {
    if (report[s.id]) return
    const pays = await listPayments(s.branch_id, s.opened_at)
    const until = s.closed_at ? new Date(s.closed_at).getTime() : Date.now()
    const r = pays.filter((p) => p.status === 'completed' && new Date(p.created_at).getTime() <= until)
    const agg = { cash: 0, card: 0, qr: 0, other: 0, total: 0 }
    r.forEach((p) => {
      const amt = Number(p.amount)
      agg.total += amt
      if (p.method === 'cash') agg.cash += amt
      else if (p.method === 'card') agg.card += amt
      else if (p.method === 'qr') agg.qr += amt
      else agg.other += amt
    })
    setReport((prev) => ({ ...prev, [s.id]: agg }))
  }

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading) return <div className="py-10 text-center"><Spinner /> Loading shifts…</div>

  const closed = shifts.filter((s) => s.closed_at)
  const totalVariance = closed.reduce((s, x) => s + Number(x.variance ?? 0), 0)
  const over = closed.filter((s) => Math.abs(Number(s.variance ?? 0)) > 10)

  return (
    <div className="space-y-4">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Shifts"      value={shifts.length} />
        <Stat label="Open"        value={shifts.length - closed.length} />
        <Stat label="Total variance" value={MYR(totalVariance)} tone={Math.abs(totalVariance) > 20 ? 'accent' : 'default'} />
        <Stat label="Over $10 variance" value={over.length} />
      </div>

      {shifts.length === 0 ? (
        <EmptyState title="No shifts yet" description="Open a shift in the Cashier tab." />
      ) : (
        <div className="space-y-2">
          {shifts.map((s) => {
            const e = employees.find((x) => x.id === s.employee_id)
            const opened = new Date(s.opened_at)
            const closedAt = s.closed_at ? new Date(s.closed_at) : null
            const isOpen = !closedAt
            const isExpanded = expanded === s.id
            return (
              <Card key={s.id}>
                <CardBody>
                  <button onClick={() => { setExpanded(isExpanded ? null : s.id); if (!isExpanded) void loadReport(s) }}
                    className="w-full flex items-center justify-between">
                    <div className="text-left">
                      <div className="font-display">
                        {e?.name ?? '—'} · {shortDate(s.opened_at)} {shortTime(s.opened_at)}
                        {isOpen
                          ? <Badge tone="brand" className="ml-2">open</Badge>
                          : <Badge tone={Math.abs(Number(s.variance ?? 0)) > 10 ? 'red' : 'green'} className="ml-2">
                              closed · variance {MYR(Number(s.variance ?? 0))}
                            </Badge>}
                      </div>
                      <div className="text-xs text-ink-500">
                        Float {MYR(Number(s.opening_float))}
                        {closedAt && <> · Closed {shortTime(closedAt.toISOString())} ({Math.max(1, Math.round((closedAt.getTime() - opened.getTime()) / 60_000))}m)</>}
                      </div>
                    </div>
                    <div className="text-right">
                      {!isOpen && (
                        <>
                          <div className="text-xs text-ink-500">Expected {MYR(Number(s.expected_cash ?? 0))}</div>
                          <div className="text-xs text-ink-500">Actual {MYR(Number(s.actual_cash ?? 0))}</div>
                        </>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t">
                      {!report[s.id] ? (
                        <div className="text-sm text-ink-500">Computing X-report…</div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                          <div><div className="text-ink-500 text-xs">Total</div><div className="font-display">{MYR(report[s.id].total)}</div></div>
                          <div><div className="text-ink-500 text-xs">Cash</div><div>{MYR(report[s.id].cash)}</div></div>
                          <div><div className="text-ink-500 text-xs">Card</div><div>{MYR(report[s.id].card)}</div></div>
                          <div><div className="text-ink-500 text-xs">QR</div><div>{MYR(report[s.id].qr)}</div></div>
                          <div><div className="text-ink-500 text-xs">Other</div><div>{MYR(report[s.id].other)}</div></div>
                        </div>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
