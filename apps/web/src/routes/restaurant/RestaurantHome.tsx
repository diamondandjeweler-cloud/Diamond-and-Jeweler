import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardBody, CardHeader, EmptyState, LiveDot, Spinner, Stat } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listActiveOrders, listIngredients, listKitchenTickets, listTables, dailySales,
} from '../../lib/restaurant/store'
import type { Order, KitchenTicket, RestaurantTable, Ingredient } from '../../lib/restaurant/types'
import { MYR, minutesAgo } from '../../lib/restaurant/format'

export default function RestaurantHome() {
  const { branchId, branch } = useRestaurant()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [tickets, setTickets] = useState<KitchenTicket[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [sales, setSales] = useState(0)

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const [o, t, tb, ing, s] = await Promise.all([
          listActiveOrders(branchId),
          listKitchenTickets(branchId),
          listTables(branchId),
          listIngredients(branchId),
          dailySales(branchId, today.toISOString()),
        ])
        if (cancelled) return
        setOrders(o); setTickets(t); setTables(tb); setIngredients(ing); setSales(s)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [branchId])

  if (!branchId) return <EmptyState title="Pick a branch to continue" />
  if (loading)   return <div className="py-10 text-center text-ink-500"><Spinner /> Loading…</div>

  const lowStock = ingredients.filter((i) => i.reorder_level && i.current_stock < Number(i.reorder_level))
  const freeTables = tables.filter((t) => t.status === 'free').length
  const occupied = tables.filter((t) => t.status === 'occupied').length
  const utilization = tables.length > 0 ? Math.round((occupied / tables.length) * 100) : 0

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Today's revenue"
          value={MYR(sales)}
          tone="brand"
          hint={<LiveDot label={`${branch?.name ?? ''}`} />}
          icon={<IconCurrency />}
        />
        <Stat
          label="Active orders"
          value={orders.length}
          hint={`${tickets.length} tickets in flight`}
          icon={<IconOrders />}
        />
        <Stat
          label="Tables in use"
          value={`${occupied}/${tables.length}`}
          hint={`${utilization}% utilization · ${freeTables} free`}
          icon={<IconTables />}
        />
        <Stat
          label="Low stock"
          value={lowStock.length}
          hint={lowStock.length === 0 ? 'All ingredients above reorder' : 'Below reorder level'}
          tone={lowStock.length > 0 ? 'danger' : 'success'}
          icon={<IconAlert />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card elevated>
          <CardHeader
            eyebrow="Service"
            title="Active orders"
            subtitle={`${orders.length} open · live updating`}
            right={<Link className="btn-secondary btn-sm" to="/restaurant/orders">View all →</Link>}
          />
          <CardBody className="pt-0">
            {orders.length === 0 ? (
              <EmptyState
                title="No active orders"
                description="Place one from the Kiosk to see it here."
                action={<Link className="btn-brand btn-sm" to="/restaurant/kiosk">Open kiosk</Link>}
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {orders.slice(0, 8).map((o) => (
                  <li key={o.id} className="py-2.5 flex items-center justify-between text-sm group hover:bg-ink-50/50 -mx-2 px-2 rounded-lg transition-colors">
                    <div className="min-w-0">
                      <div className="font-medium text-ink-900">#{o.id.slice(0, 8)}</div>
                      <div className="text-xs text-ink-500 mt-0.5">
                        <span className="capitalize">{o.order_type}</span>
                        <span className="mx-1.5">·</span>
                        <span>{minutesAgo(o.created_at)}m ago</span>
                      </div>
                    </div>
                    <div className="font-display text-ink-900">{MYR(o.total)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card elevated>
          <CardHeader
            eyebrow="Kitchen"
            title="Ticket queue"
            subtitle={`${tickets.length} active`}
            right={<Link className="btn-secondary btn-sm" to="/restaurant/kds">Open KDS →</Link>}
          />
          <CardBody className="pt-0">
            {tickets.length === 0 ? (
              <EmptyState title="Kitchen clear" description="No pending tickets across stations." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {tickets.slice(0, 8).map((t) => {
                  const age = minutesAgo(t.created_at)
                  const tone = age < 2 ? 'green' : age < 8 ? 'amber' : 'red'
                  return (
                    <li key={t.id} className="py-2.5 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2 w-2 rounded-full ${
                          tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-red-500 animate-pulse'
                        }`} />
                        <div>
                          <div className="font-medium capitalize text-ink-900">{t.station}</div>
                          <div className="text-xs text-ink-500">{age}m ago</div>
                        </div>
                      </div>
                      <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">{t.status}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card elevated>
          <CardHeader
            eyebrow="Inventory"
            title="Low stock"
            subtitle={`${lowStock.length} ingredient${lowStock.length === 1 ? '' : 's'} below reorder`}
            right={<Link className="btn-secondary btn-sm" to="/restaurant/inventory">Inventory →</Link>}
          />
          <CardBody className="pt-0">
            {lowStock.length === 0 ? (
              <EmptyState title="All stocked" description="No ingredients below reorder level." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {lowStock.map((i) => (
                  <li key={i.id} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-900">{i.name}</span>
                    <span className="text-red-600 font-mono text-xs">
                      {i.current_stock} / {i.reorder_level} {i.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card elevated>
          <CardHeader
            eyebrow="Floor"
            title="Tables"
            subtitle={`${tables.length} tables · ${utilization}% utilization`}
            right={<Link className="btn-secondary btn-sm" to="/restaurant/floor">Open floor →</Link>}
          />
          <CardBody className="pt-0">
            <div className="grid grid-cols-6 gap-2">
              {tables.map((t) => (
                <div
                  key={t.id}
                  className={`aspect-square border rounded-lg flex flex-col items-center justify-center text-xs font-semibold transition-all ${
                    t.status === 'free'      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : t.status === 'occupied' ? 'border-red-300 bg-red-50 text-red-800'
                    : t.status === 'reserved' ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-ink-200 bg-ink-50 text-ink-500'
                  }`}
                  title={`${t.table_number} · ${t.status}`}
                >
                  <span>{t.table_number}</span>
                  <span className="text-[10px] opacity-70 font-normal">{t.capacity}p</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 pt-4 border-t border-ink-200">
        <Link to="/restaurant/kiosk" className="btn-brand">+ New order</Link>
        <Link to="/restaurant/floor" className="btn-secondary">Seat a table</Link>
        <Link to="/restaurant/cashier" className="btn-secondary">Open cashier</Link>
        <Link to="/restaurant/staff"  className="btn-ghost">Staff & clock-in</Link>
      </div>
    </div>
  )
}

/* ------------------ Inline icons (small, hairline) ------------------ */

function IconCurrency() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v18M16 7H9.5a3 3 0 0 0 0 6H14a3 3 0 0 1 0 6H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function IconOrders() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function IconTables() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="9" width="18" height="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 11v8M19 11v8M9 11v6M15 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function IconAlert() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 10v4M12 17v.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
