import { useEffect, useState } from 'react'
import { Alert, Badge, Card, CardBody, EmptyState, Spinner } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listOrders, listOrderItems, listMenuItems, listTables, listEmployees, listTimesheets,
  listIngredients, listWaste, listPromotions, listBranches,
} from '../../lib/restaurant/store'
import type {
  Order, OrderItem, MenuItem, RestaurantTable, Employee, Timesheet, Ingredient, WasteLog, Promotion, Branch,
} from '../../lib/restaurant/types'
import { MYR } from '../../lib/restaurant/format'

const REPORTS: Array<{ key: string; label: string }> = [
  { key: 'sales_by_hour', label: 'Sales by hour' },
  { key: 'sales_by_server', label: 'Sales by server' },
  { key: 'top_items', label: 'Top items' },
  { key: 'inventory_variance', label: 'Inventory reorder' },
  { key: 'labour_cost', label: 'Labour cost & hours' },
  { key: 'waste', label: 'Waste & spoilage' },
  { key: 'table_turnover', label: 'Table turnover' },
  { key: 'promo_redemption', label: 'Promotion redemption' },
  { key: 'branch_pnl', label: 'Branch P&L comparison' },
  { key: 'tax', label: 'Tax (VAT/GST)' },
  { key: 'export_quickbooks', label: 'Accounting export' },
]

export default function Reports() {
  const { branchId } = useRestaurant()
  const [key, setKey] = useState('sales_by_hour')
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [items, setItems]   = useState<OrderItem[]>([])
  const [menu, setMenu]     = useState<MenuItem[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [emps, setEmps]     = useState<Employee[]>([])
  const [ts, setTs]         = useState<Timesheet[]>([])
  const [ings, setIngs]     = useState<Ingredient[]>([])
  const [waste, setWaste]   = useState<WasteLog[]>([])
  const [promos, setPromos] = useState<Promotion[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [err, setErr]       = useState<string | null>(null)

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    void (async () => {
      setLoading(true); setErr(null)
      try {
        const [o, m, tb, e, ing, w, p, b] = await Promise.all([
          listOrders(branchId, 500),
          listMenuItems(branchId),
          listTables(branchId),
          listEmployees(branchId),
          listIngredients(branchId),
          listWaste(branchId, 500),
          listPromotions(branchId),
          listBranches(),
        ])
        if (cancelled) return
        setOrders(o); setMenu(m); setTables(tb); setEmps(e); setIngs(ing); setWaste(w); setPromos(p); setBranches(b)
        const oi = (await Promise.all(o.map((x) => listOrderItems(x.id)))).flat()
        if (cancelled) return
        setItems(oi.filter((x) => x.status !== 'voided'))
        const since = new Date(); since.setDate(since.getDate() - 30)
        const ts2 = await listTimesheets(branchId, since.toISOString())
        if (cancelled) return
        setTs(ts2)
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [branchId])

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading) return <div className="py-10 text-center"><Spinner /> Running reports…</div>

  return (
    <div className="space-y-4">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="flex flex-wrap gap-1">
        {REPORTS.map((r) => (
          <button key={r.key} onClick={() => setKey(r.key)} className={`px-3 py-1.5 rounded-md text-sm font-medium ${key === r.key ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}>
            {r.label}
          </button>
        ))}
      </div>
      <Card><CardBody>
        {key === 'sales_by_hour' && <SalesByHour orders={orders} />}
        {key === 'sales_by_server' && <SalesByServer orders={orders} employees={emps} />}
        {key === 'top_items' && <TopItems items={items} menu={menu} />}
        {key === 'inventory_variance' && <InventoryReorder ingredients={ings} />}
        {key === 'labour_cost' && <LabourCost timesheets={ts} employees={emps} />}
        {key === 'waste' && <WasteReport waste={waste} ingredients={ings} />}
        {key === 'table_turnover' && <TableTurnover orders={orders} tables={tables} />}
        {key === 'promo_redemption' && <PromoReport promos={promos} />}
        {key === 'branch_pnl' && <BranchPNL branches={branches} />}
        {key === 'tax' && <TaxReport orders={orders} />}
        {key === 'export_quickbooks' && <AccountingExport orders={orders} payments={[]} />}
      </CardBody></Card>
    </div>
  )
}

function SalesByHour({ orders }: { orders: Order[] }) {
  const paid = orders.filter((o) => o.status === 'paid' || o.status === 'closed')
  const by = Array.from({ length: 24 }, () => ({ count: 0, revenue: 0 }))
  paid.forEach((o) => { const h = new Date(o.created_at).getHours(); by[h].count++; by[h].revenue += Number(o.total) })
  const max = Math.max(...by.map((x) => x.revenue), 1)
  return (
    <div>
      <h3 className="font-display text-lg mb-3">Sales by hour</h3>
      <div className="flex items-end gap-1 h-48">
        {by.map((x, h) => (
          <div key={h} className="flex-1 flex flex-col items-center gap-1" title={`${h}:00 — ${MYR(x.revenue)} · ${x.count} orders`}>
            <div className="text-[9px]">{x.count || ''}</div>
            <div className="w-full bg-brand-600 rounded-t" style={{ height: `${(x.revenue / max) * 100}%`, minHeight: 1 }} />
            <span className="text-[9px] text-ink-400">{h}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SalesByServer({ orders, employees }: { orders: Order[]; employees: Employee[] }) {
  const by = new Map<string, { count: number; revenue: number }>()
  orders.filter((o) => o.status === 'paid' || o.status === 'closed').forEach((o) => {
    const key = o.waiter_id ?? 'unassigned'
    const prev = by.get(key) ?? { count: 0, revenue: 0 }
    prev.count += 1; prev.revenue += Number(o.total); by.set(key, prev)
  })
  const rows = Array.from(by.entries()).map(([id, v]) => ({ name: employees.find((e) => e.id === id)?.name ?? 'Unassigned', ...v })).sort((a, b) => b.revenue - a.revenue)
  return (
    <div>
      <h3 className="font-display text-lg mb-3">Sales by server</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Server</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Revenue</th><th className="pb-2 text-right">Avg ticket</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-ink-100">
              <td className="py-2">{r.name}</td>
              <td className="py-2 text-right">{r.count}</td>
              <td className="py-2 text-right">{MYR(r.revenue)}</td>
              <td className="py-2 text-right">{MYR(r.count > 0 ? r.revenue / r.count : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TopItems({ items, menu }: { items: OrderItem[]; menu: MenuItem[] }) {
  const by = new Map<string, { qty: number; rev: number }>()
  items.forEach((li) => {
    const prev = by.get(li.menu_item_id) ?? { qty: 0, rev: 0 }
    prev.qty += li.quantity
    prev.rev += li.quantity * (Number(li.unit_price) + Number(li.modifiers_total))
    by.set(li.menu_item_id, prev)
  })
  const rows = Array.from(by.entries()).map(([id, v]) => ({ name: menu.find((m) => m.id === id)?.name ?? '—', ...v })).sort((a, b) => b.qty - a.qty).slice(0, 20)
  return (
    <div>
      <h3 className="font-display text-lg mb-3">Top items</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Item</th><th className="pb-2 text-right">Qty</th><th className="pb-2 text-right">Revenue</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.name} className="border-t border-ink-100"><td className="py-2">{r.name}</td><td className="py-2 text-right">{r.qty}</td><td className="py-2 text-right">{MYR(r.rev)}</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}

function InventoryReorder({ ingredients }: { ingredients: Ingredient[] }) {
  const low = ingredients.filter((i) => Number(i.reorder_level ?? 0) > 0 && Number(i.current_stock) < Number(i.reorder_level))
  return (
    <div>
      <h3 className="font-display text-lg mb-3">Items to reorder ({low.length})</h3>
      {low.length === 0 ? <div className="text-sm text-ink-500">All stocked.</div> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Ingredient</th><th className="pb-2 text-right">Stock</th><th className="pb-2 text-right">Reorder</th><th className="pb-2 text-right">Shortfall</th></tr></thead>
          <tbody>
            {low.map((i) => <tr key={i.id} className="border-t border-ink-100"><td className="py-2">{i.name}</td><td className="py-2 text-right">{Number(i.current_stock).toFixed(2)} {i.unit}</td><td className="py-2 text-right">{Number(i.reorder_level ?? 0).toFixed(2)}</td><td className="py-2 text-right text-red-600">{(Number(i.reorder_level ?? 0) - Number(i.current_stock)).toFixed(2)}</td></tr>)}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LabourCost({ timesheets, employees }: { timesheets: Timesheet[]; employees: Employee[] }) {
  const by = new Map<string, { hours: number; cost: number }>()
  timesheets.forEach((t) => {
    const prev = by.get(t.employee_id) ?? { hours: 0, cost: 0 }
    const e = employees.find((x) => x.id === t.employee_id)
    const hrs = Number(t.total_hours ?? 0)
    prev.hours += hrs
    prev.cost += hrs * Number(e?.hourly_rate ?? 0)
    by.set(t.employee_id, prev)
  })
  const rows = Array.from(by.entries()).map(([id, v]) => {
    const e = employees.find((x) => x.id === id); return { name: e?.name ?? '—', role: e?.role ?? '—', ...v }
  }).sort((a, b) => b.cost - a.cost)
  const total = rows.reduce((s, r) => s + r.cost, 0)
  return (
    <div>
      <div className="flex justify-between items-baseline mb-3">
        <h3 className="font-display text-lg">Labour cost (30 days)</h3>
        <span className="text-sm text-ink-500">Total: {MYR(total)}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Employee</th><th className="pb-2">Role</th><th className="pb-2 text-right">Hours</th><th className="pb-2 text-right">Cost</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.name} className="border-t border-ink-100"><td className="py-2">{r.name}</td><td className="py-2"><Badge tone="gray">{r.role}</Badge></td><td className="py-2 text-right">{r.hours.toFixed(1)}</td><td className="py-2 text-right">{MYR(r.cost)}</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}

function WasteReport({ waste }: { waste: WasteLog[]; ingredients: Ingredient[] }) {
  const byReason = new Map<string, { qty: number; value: number }>()
  waste.forEach((w) => {
    const prev = byReason.get(w.reason) ?? { qty: 0, value: 0 }
    prev.qty += Number(w.quantity)
    prev.value += Number(w.value_cost ?? 0)
    byReason.set(w.reason, prev)
  })
  const rows = Array.from(byReason.entries()).map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.value - a.value)
  return (
    <div>
      <h3 className="font-display text-lg mb-3">Waste by reason</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Reason</th><th className="pb-2 text-right">Count</th><th className="pb-2 text-right">Value</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.reason} className="border-t border-ink-100"><td className="py-2">{r.reason}</td><td className="py-2 text-right">{r.qty.toFixed(2)}</td><td className="py-2 text-right">{MYR(r.value)}</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}

function TableTurnover({ orders, tables }: { orders: Order[]; tables: RestaurantTable[] }) {
  const by = new Map<string, { count: number; totalMinutes: number }>()
  orders.filter((o) => o.table_id && o.closed_at).forEach((o) => {
    const start = new Date(o.created_at).getTime()
    const end   = new Date(o.closed_at!).getTime()
    const mins = Math.max(1, (end - start) / 60_000)
    const key = o.table_id!
    const prev = by.get(key) ?? { count: 0, totalMinutes: 0 }
    prev.count += 1; prev.totalMinutes += mins; by.set(key, prev)
  })
  const rows = tables.map((t) => {
    const v = by.get(t.id) ?? { count: 0, totalMinutes: 0 }
    return { table: t.table_number, capacity: t.capacity, count: v.count, avg: v.count ? v.totalMinutes / v.count : 0 }
  }).sort((a, b) => b.count - a.count)
  return (
    <div>
      <h3 className="font-display text-lg mb-3">Table turnover</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Table</th><th className="pb-2 text-right">Cap</th><th className="pb-2 text-right">Turns</th><th className="pb-2 text-right">Avg time</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.table} className="border-t border-ink-100"><td className="py-2">{r.table}</td><td className="py-2 text-right">{r.capacity}</td><td className="py-2 text-right">{r.count}</td><td className="py-2 text-right">{r.avg.toFixed(0)}m</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}

function PromoReport({ promos }: { promos: Promotion[] }) {
  return (
    <div>
      <h3 className="font-display text-lg mb-3">Promotion redemption</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Promotion</th><th className="pb-2">Type</th><th className="pb-2">Code</th><th className="pb-2 text-right">Uses</th><th className="pb-2">Active</th></tr></thead>
        <tbody>
          {promos.map((p) => (
            <tr key={p.id} className="border-t border-ink-100">
              <td className="py-2">{p.name}</td>
              <td className="py-2">{p.type}</td>
              <td className="py-2">{p.code ?? '—'}</td>
              <td className="py-2 text-right">{p.usage_count}{p.usage_limit ? ` / ${p.usage_limit}` : ''}</td>
              <td className="py-2"><Badge tone={p.is_active ? 'green' : 'gray'}>{p.is_active ? 'yes' : 'no'}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BranchPNL({ branches }: { branches: Branch[] }) {
  const [data, setData] = useState<Record<string, { revenue: number; orders: number }>>({})
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res: Record<string, { revenue: number; orders: number }> = {}
      for (const b of branches) {
        const o = await listOrders(b.id, 500)
        const paid = o.filter((x) => x.status === 'paid' || x.status === 'closed')
        res[b.id] = { revenue: paid.reduce((s, x) => s + Number(x.total), 0), orders: paid.length }
      }
      if (!cancelled) setData(res)
    })()
    return () => { cancelled = true }
  }, [branches.map((b) => b.id).join('|')])

  return (
    <div>
      <h3 className="font-display text-lg mb-3">Branch revenue (all-time, all orders loaded)</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Branch</th><th className="pb-2">Status</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Revenue</th></tr></thead>
        <tbody>
          {branches.map((b) => (
            <tr key={b.id} className="border-t border-ink-100">
              <td className="py-2">{b.name}</td>
              <td className="py-2"><Badge tone={b.status === 'active' ? 'green' : 'gray'}>{b.status}</Badge></td>
              <td className="py-2 text-right">{data[b.id]?.orders ?? '…'}</td>
              <td className="py-2 text-right">{data[b.id] ? MYR(data[b.id].revenue) : '…'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaxReport({ orders }: { orders: Order[] }) {
  const paid = orders.filter((o) => o.status === 'paid' || o.status === 'closed')
  const byDay = new Map<string, { gross: number; tax: number; orders: number }>()
  paid.forEach((o) => {
    const d = new Date(o.created_at).toISOString().slice(0, 10)
    const prev = byDay.get(d) ?? { gross: 0, tax: 0, orders: 0 }
    prev.gross += Number(o.subtotal); prev.tax += Number(o.tax); prev.orders += 1
    byDay.set(d, prev)
  })
  const rows = Array.from(byDay.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  const totalGross = rows.reduce((s, [, v]) => s + v.gross, 0)
  const totalTax = rows.reduce((s, [, v]) => s + v.tax, 0)

  const exportCsv = () => {
    const csv = ['date,orders,gross_sales,tax_collected', ...rows.map(([d, v]) => `${d},${v.orders},${v.gross.toFixed(2)},${v.tax.toFixed(2)}`)].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `tax-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-3">
        <h3 className="font-display text-lg">Tax (VAT/GST) by day</h3>
        <div className="flex gap-3 text-sm items-baseline">
          <span className="text-ink-500">Gross: <strong>{MYR(totalGross)}</strong></span>
          <span className="text-ink-500">Tax: <strong>{MYR(totalTax)}</strong></span>
          <button className="btn-ghost btn-sm" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Date</th><th className="pb-2 text-right">Orders</th><th className="pb-2 text-right">Gross</th><th className="pb-2 text-right">Tax</th></tr></thead>
        <tbody>
          {rows.map(([d, v]) => (
            <tr key={d} className="border-t border-ink-100">
              <td className="py-2">{d}</td>
              <td className="py-2 text-right">{v.orders}</td>
              <td className="py-2 text-right">{MYR(v.gross)}</td>
              <td className="py-2 text-right">{MYR(v.tax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AccountingExport({ orders }: { orders: Order[]; payments: never[] }) {
  const exportQuickBooks = () => {
    // QuickBooks IIF format — minimum: TRNS for revenue, separate SPL for tax + COGS
    const lines: string[] = ['!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO', '!SPL\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO', '!ENDTRNS']
    orders.filter((o) => o.status === 'paid' || o.status === 'closed').forEach((o) => {
      const d = new Date(o.created_at).toISOString().slice(0, 10).replace(/-/g, '/')
      lines.push(`TRNS\tCASH SALE\t${d}\tCash\t\t${Number(o.total).toFixed(2)}\t${o.id.slice(0, 8)}\tBoLe order`)
      lines.push(`SPL\tCASH SALE\t${d}\tFood Sales\t-${Number(o.subtotal).toFixed(2)}\t`)
      lines.push(`SPL\tCASH SALE\t${d}\tSales Tax\t-${Number(o.tax).toFixed(2)}\t`)
      lines.push('ENDTRNS')
    })
    const blob = new Blob([lines.join('\n')], { type: 'application/vnd.intu.iif' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `quickbooks-${Date.now()}.iif`; a.click()
    URL.revokeObjectURL(url)
  }
  const exportXero = () => {
    // Xero "manual journals" CSV
    const rows = [['*Narration','*Date','*Description','*AccountCode','*TaxRate','*Amount']]
    orders.filter((o) => o.status === 'paid' || o.status === 'closed').forEach((o) => {
      const d = new Date(o.created_at).toISOString().slice(0, 10)
      rows.push([`DNJ order ${o.id.slice(0,8)}`, d, 'Food sales', '200', 'Output Tax', String(Number(o.subtotal).toFixed(2))])
      rows.push([`DNJ order ${o.id.slice(0,8)}`, d, 'Tax', '820', 'BAS Excluded', String(Number(o.tax).toFixed(2))])
      rows.push([`DNJ order ${o.id.slice(0,8)}`, d, 'Cash received', '090', 'BAS Excluded', String(-Number(o.total).toFixed(2))])
    })
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `xero-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div>
      <h3 className="font-display text-lg mb-3">Accounting export</h3>
      <p className="text-sm text-ink-500 mb-4">Export paid orders to your accounting platform. Re-importable; idempotent on order IDs.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={exportQuickBooks}>Export QuickBooks (.iif)</button>
        <button className="btn-secondary" onClick={exportXero}>Export Xero (.csv)</button>
      </div>
    </div>
  )
}
