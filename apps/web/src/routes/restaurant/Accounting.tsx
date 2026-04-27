import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Card, CardBody, EmptyState, Spinner, Stat } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listOrders, listOrderItems, listMenuItems, listIngredients,
  listRecipeForMany, listTimesheets, listEmployees, listWaste,
} from '../../lib/restaurant/store'
import type {
  Ingredient, MenuItem, Order, OrderItem, Recipe, Employee, Timesheet, WasteLog,
} from '../../lib/restaurant/types'
import { MYR } from '../../lib/restaurant/format'

type Period = 'today' | 'week' | 'month'

export default function Accounting() {
  const { branchId } = useRestaurant()
  const [period, setPeriod] = useState<Period>('today')
  const [orders, setOrders] = useState<Order[]>([])
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [waste, setWaste] = useState<WasteLog[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const since = useMemo(() => {
    const d = new Date()
    if (period === 'today') d.setHours(0, 0, 0, 0)
    if (period === 'week')  d.setDate(d.getDate() - 7)
    if (period === 'month') d.setDate(d.getDate() - 30)
    return d.toISOString()
  }, [period])

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    void (async () => {
      setLoading(true); setErr(null)
      try {
        const [o, m, i, e, w] = await Promise.all([
          listOrders(branchId, 500),
          listMenuItems(branchId),
          listIngredients(branchId),
          listEmployees(branchId),
          listWaste(branchId, 500),
        ])
        if (cancelled) return
        const filtered = o.filter((x) => new Date(x.created_at) >= new Date(since))
        setOrders(filtered); setMenuItems(m); setIngredients(i); setEmployees(e); setWaste(w)

        const itemIds = Array.from(new Set(filtered.map((x) => x.id)))
        const items = (await Promise.all(itemIds.map((id) => listOrderItems(id)))).flat()
        if (cancelled) return
        setOrderItems(items.filter((x) => x.status !== 'voided'))

        const recs = await listRecipeForMany(m.map((mi) => mi.id))
        if (cancelled) return
        setRecipes(recs)

        const ts = await listTimesheets(branchId, since)
        if (cancelled) return
        setTimesheets(ts)
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [branchId, since])

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading) return <div className="py-10 text-center"><Spinner /> Computing P&L…</div>

  const paidOrders = orders.filter((o) => o.status === 'paid' || o.status === 'closed')
  const paidOrderIds = new Set(paidOrders.map((o) => o.id))
  const revenue = paidOrders.reduce((s, o) => s + Number(o.total), 0)
  const discount = paidOrders.reduce((s, o) => s + Number(o.discount), 0)
  const tax = paidOrders.reduce((s, o) => s + Number(o.tax), 0)
  const grossSales = paidOrders.reduce((s, o) => s + Number(o.subtotal), 0)

  const itemCost = (li: OrderItem): number => {
    const recipeLines = recipes.filter((r) => r.menu_item_id === li.menu_item_id)
    return recipeLines.reduce((s, r) => {
      const ing = ingredients.find((i) => i.id === r.ingredient_id)
      return s + (ing ? Number(r.quantity) * Number(ing.cost_per_unit) : 0)
    }, 0) * li.quantity
  }
  // COGS must match revenue scope — only items from paid/closed orders
  const soldItems = orderItems.filter((li) => paidOrderIds.has(li.order_id))
  const cogs = soldItems.reduce((s, li) => s + itemCost(li), 0)
  const wasteValue = waste.filter((w) => new Date(w.created_at) >= new Date(since)).reduce((s, w) => s + Number(w.value_cost ?? 0), 0)

  const labour = timesheets.reduce((s, t) => {
    const e = employees.find((x) => x.id === t.employee_id)
    const rate = Number(e?.hourly_rate ?? 0)
    return s + Number(t.total_hours ?? 0) * rate
  }, 0)

  const grossProfit = revenue - cogs
  const netProfit = revenue - cogs - labour - wasteValue

  // Menu engineering per item (scoped to sold items so popularity/profitability matches revenue)
  const perItem = menuItems.map((mi) => {
    const lines = soldItems.filter((li) => li.menu_item_id === mi.id)
    const qty = lines.reduce((s, l) => s + l.quantity, 0)
    const rev = lines.reduce((s, l) => s + l.quantity * (Number(l.unit_price) + Number(l.modifiers_total)), 0)
    const cost = lines.reduce((s, l) => s + itemCost(l), 0)
    const margin = rev > 0 ? (rev - cost) / rev : 0
    return { mi, qty, rev, cost, margin }
  })
  const medQty = [...perItem].sort((a, b) => a.qty - b.qty)[Math.floor(perItem.length / 2)]?.qty ?? 0
  const medMargin = [...perItem].sort((a, b) => a.margin - b.margin)[Math.floor(perItem.length / 2)]?.margin ?? 0

  const classify = (p: { qty: number; margin: number }): 'Star' | 'Plow horse' | 'Puzzle' | 'Dog' => {
    const popular = p.qty >= medQty
    const profitable = p.margin >= medMargin
    if (popular && profitable) return 'Star'
    if (popular && !profitable) return 'Plow horse'
    if (!popular && profitable) return 'Puzzle'
    return 'Dog'
  }

  const topSellers = [...perItem].sort((a, b) => b.qty - a.qty).slice(0, 10)
  const bottomSellers = [...perItem].filter((p) => p.qty > 0).sort((a, b) => a.qty - b.qty).slice(0, 10)

  const hourly = Array.from({ length: 24 }, () => 0)
  paidOrders.forEach((o) => { hourly[new Date(o.created_at).getHours()] += Number(o.total) })

  return (
    <div className="space-y-6">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="flex items-center gap-1">
        {(['today', 'week', 'month'] as const).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${period === p ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}>
            {p === 'today' ? 'Today' : p === 'week' ? 'Last 7 days' : 'Last 30 days'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Revenue"    value={MYR(revenue)} tone="brand" />
        <Stat label="Gross sales" value={MYR(grossSales)} />
        <Stat label="COGS"        value={MYR(cogs)} hint={`${revenue > 0 ? ((cogs/revenue)*100).toFixed(1) : '0'}% of rev`} />
        <Stat label="Labour"      value={MYR(labour)} />
        <Stat label="Net profit"  value={MYR(netProfit)} tone={netProfit >= 0 ? 'brand' : 'accent'} hint={`${paidOrders.length} orders`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardBody>
          <h3 className="font-display text-lg mb-3">Menu engineering matrix</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500"><tr><th className="pb-2">Item</th><th className="pb-2 text-right">Qty</th><th className="pb-2 text-right">Rev</th><th className="pb-2 text-right">Margin</th><th className="pb-2">Class</th></tr></thead>
            <tbody>
              {perItem.sort((a, b) => b.rev - a.rev).map((p) => {
                const c = classify(p)
                const tone = c === 'Star' ? 'green' : c === 'Plow horse' ? 'amber' : c === 'Puzzle' ? 'brand' : 'red'
                return (
                  <tr key={p.mi.id} className="border-t border-ink-100">
                    <td className="py-2">{p.mi.name}</td>
                    <td className="py-2 text-right">{p.qty}</td>
                    <td className="py-2 text-right">{MYR(p.rev)}</td>
                    <td className="py-2 text-right">{(p.margin * 100).toFixed(1)}%</td>
                    <td className="py-2"><Badge tone={tone}>{c}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardBody></Card>

        <div className="space-y-4">
          <Card><CardBody>
            <h3 className="font-display text-lg mb-3">Sales by hour</h3>
            <div className="flex items-end gap-1 h-40">
              {hourly.map((v, h) => {
                const max = Math.max(...hourly, 1)
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1" title={`${h}:00 — ${MYR(v)}`}>
                    <div className="w-full bg-brand-600 rounded-t" style={{ height: `${(v/max)*100}%`, minHeight: 1 }} />
                    <span className="text-[9px] text-ink-400">{h}</span>
                  </div>
                )
              })}
            </div>
          </CardBody></Card>

          <Card><CardBody>
            <h3 className="font-display text-lg mb-3">Top sellers</h3>
            <ol className="space-y-1 text-sm">
              {topSellers.map((p, i) => (
                <li key={p.mi.id} className="flex justify-between"><span>{i + 1}. {p.mi.name}</span><span>{p.qty}</span></li>
              ))}
            </ol>
          </CardBody></Card>

          <Card><CardBody>
            <h3 className="font-display text-lg mb-3">Bottom sellers</h3>
            <ol className="space-y-1 text-sm">
              {bottomSellers.map((p, i) => (
                <li key={p.mi.id} className="flex justify-between"><span>{i + 1}. {p.mi.name}</span><span>{p.qty}</span></li>
              ))}
            </ol>
          </CardBody></Card>
        </div>
      </div>

      <Card><CardBody>
        <h3 className="font-display text-lg mb-3">P&L summary</h3>
        <dl className="text-sm space-y-1">
          <div className="flex justify-between"><dt>Revenue</dt><dd>{MYR(revenue)}</dd></div>
          <div className="flex justify-between text-ink-500"><dt>  Tax collected</dt><dd>{MYR(tax)}</dd></div>
          <div className="flex justify-between text-ink-500"><dt>  Discounts given</dt><dd>{MYR(discount)}</dd></div>
          <div className="flex justify-between"><dt>COGS</dt><dd>−{MYR(cogs)}</dd></div>
          <div className="flex justify-between"><dt>Waste</dt><dd>−{MYR(wasteValue)}</dd></div>
          <div className="flex justify-between"><dt>Labour</dt><dd>−{MYR(labour)}</dd></div>
          <div className="flex justify-between font-display border-t pt-2"><dt>Gross profit</dt><dd>{MYR(grossProfit)}</dd></div>
          <div className="flex justify-between font-display text-lg"><dt>Net profit</dt><dd>{MYR(netProfit)}</dd></div>
        </dl>
        <div className="text-xs text-ink-400 mt-2">Excludes overhead (rent, utilities, other expenses not tracked by module).</div>
      </CardBody></Card>
    </div>
  )
}
