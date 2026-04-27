import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Spinner } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listKitchenTickets, updateTicketStatus, listMenuItems, listOrders, listOrderItems,
  voidItem,
} from '../../lib/restaurant/store'
import type { KitchenTicket, MenuItem, Order, OrderItem, TicketStatus } from '../../lib/restaurant/types'
import { minutesAgo, ticketAgeTone } from '../../lib/restaurant/format'

const KITCHEN_STATIONS = ['kitchen', 'grill', 'fry', 'wok', 'salad', 'pizza']

export default function Kds() {
  return <StationBoard title="Kitchen" stations={KITCHEN_STATIONS} />
}

export function BarKds() {
  return <StationBoard title="Bar & Drinks" stations={['bar']} />
}

function StationBoard({ title, stations }: { title: string; stations: string[] }) {
  const { branchId, employee } = useRestaurant()
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<KitchenTicket[]>([])
  const [items, setItems]     = useState<MenuItem[]>([])
  const [orders, setOrders]   = useState<Order[]>([])
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [error, setError]     = useState<string | null>(null)
  const [, tick] = useState(0)

  // Poll every 5s
  useEffect(() => {
    if (!branchId) return
    let alive = true
    const load = async () => {
      try {
        const [t, m, o] = await Promise.all([
          listKitchenTickets(branchId, stations),
          listMenuItems(branchId),
          listOrders(branchId, 50),
        ])
        if (!alive) return
        setTickets(t); setItems(m); setOrders(o); setError(null)
        // Pull line items for active orders referenced by tickets
        const ids = Array.from(new Set(t.map((x) => x.order_id)))
        if (ids.length) {
          const all = (await Promise.all(ids.map((id) => listOrderItems(id)))).flat()
          if (alive) setOrderItems(all)
        } else if (alive) setOrderItems([])
      } catch (e) {
        if (alive) setError((e as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    const poll = setInterval(() => { void load() }, 5000)
    const clock = setInterval(() => tick((n) => n + 1), 15000)   // age tone refresh
    return () => { alive = false; clearInterval(poll); clearInterval(clock) }
  }, [branchId, stations.join('|')])

  const groupedByOrder = useMemo(() => {
    const map = new Map<string, KitchenTicket[]>()
    tickets.forEach((t) => {
      const arr = map.get(t.order_id) ?? []
      arr.push(t)
      map.set(t.order_id, arr)
    })
    return map
  }, [tickets])

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading) return <div className="py-10 text-center text-ink-500"><Spinner /> Loading tickets…</div>

  return (
    <div>
      {error && <Alert tone="red">{error}</Alert>}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-ink-500">{title} · {tickets.length} active tickets · polling every 5s</div>
        <LegendLine />
      </div>

      {tickets.length === 0 ? (
        <EmptyState title="All clear" description="No pending tickets for this station." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from(groupedByOrder.entries()).map(([orderId, tix]) => {
            const o = orders.find((x) => x.id === orderId)
            const age = Math.max(...tix.map((t) => minutesAgo(t.created_at))) // oldest ticket drives urgency colour
            const tone = ticketAgeTone(new Date(Date.now() - age * 60_000).toISOString())
            const border =
              tone === 'red' ? 'border-red-400 bg-red-50'
              : tone === 'amber' ? 'border-amber-400 bg-amber-50'
              : 'border-emerald-400 bg-emerald-50'
            return (
              <Card key={orderId} className={`border-2 ${border}`}>
                <CardBody className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display text-lg">#{orderId.slice(0, 6)}</div>
                      <div className="text-xs text-ink-500">
                        {o?.order_type}
                        {o?.table_id && <> · Table</>} · {minutesAgo(tix[0].created_at)}m ago
                      </div>
                    </div>
                    <Badge tone={tone === 'green' ? 'green' : tone === 'amber' ? 'amber' : 'red'}>
                      {tone === 'red' ? 'late' : tone}
                    </Badge>
                  </div>

                  <ul className="space-y-2">
                    {tix.map((t) => {
                      const li = orderItems.find((x) => x.id === t.order_item_id)
                      const mi = items.find((x) => x.id === li?.menu_item_id)
                      return (
                        <li key={t.id} className="flex flex-col gap-1 bg-white/50 rounded-md p-2 border">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">
                                {li?.quantity}× {mi?.name ?? '—'}
                              </div>
                              {li?.special_instruction && (
                                <div className="text-xs text-amber-700 italic">{li.special_instruction}</div>
                              )}
                              <div className="text-xs text-ink-500">
                                Station: {t.station} · Status: {t.status}
                              </div>
                            </div>
                          </div>
                          <TicketButtons
                            ticket={t}
                            onStatus={async (next) => {
                              await updateTicketStatus(t.id, next)
                              setTickets((prev) => prev.filter((x) => !(x.id === t.id && next === 'completed')).map((x) => x.id === t.id ? { ...x, status: next } : x))
                            }}
                            onReject={async () => {
                              const reason = window.prompt('Reject reason (out of stock, spoiled, etc.)')
                              if (!reason) return
                              await updateTicketStatus(t.id, 'rejected', { rejected_reason: reason })
                              if (li) await voidItem(li.id, `Kitchen rejected: ${reason}`, employee?.id ?? null)
                              setTickets((prev) => prev.filter((x) => x.id !== t.id))
                            }}
                            onRemake={async () => {
                              const reason = window.prompt('Remake reason (overcooked, wrong modifier, etc.)')
                              if (!reason) return
                              // Send the ticket back to "pending" + log waste using recipe
                              await updateTicketStatus(t.id, 'pending', { rejected_reason: null })
                              const db = (await import('../../lib/restaurant/store')).logRemake
                              await db(t.id, t.order_item_id ?? null, reason, branchId!, employee?.id ?? null)
                              setTickets((prev) => prev.map((x) => x.id === t.id ? { ...x, status: 'pending' } : x))
                            }}
                            onRequestIngredient={async () => {
                              const what = window.prompt('Which ingredient is needed? (will notify storekeepers)')
                              if (!what) return
                              const { requestIngredient } = await import('../../lib/restaurant/store')
                              await requestIngredient(branchId!, what, t.id, employee?.id ?? null)
                              window.alert('Storekeeper notified')
                            }}
                          />
                        </li>
                      )
                    })}
                  </ul>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TicketButtons({ ticket, onStatus, onReject, onRemake, onRequestIngredient }: {
  ticket: KitchenTicket
  onStatus: (s: TicketStatus) => Promise<void>
  onReject: () => Promise<void>
  onRemake: () => Promise<void>
  onRequestIngredient: () => Promise<void>
}) {
  const s = ticket.status
  return (
    <div className="flex flex-wrap gap-1">
      {s === 'pending' && (
        <Button size="sm" variant="secondary" onClick={() => onStatus('acknowledged')}>Ack</Button>
      )}
      {(s === 'pending' || s === 'acknowledged') && (
        <Button size="sm" onClick={() => onStatus('started')}>Start</Button>
      )}
      {s === 'started' && (
        <Button size="sm" onClick={() => onStatus('ready')}>Ready</Button>
      )}
      {s === 'ready' && (
        <Button size="sm" variant="brand" onClick={() => onStatus('completed')}>Bump</Button>
      )}
      {s !== 'completed' && s !== 'rejected' && (
        <>
          <Button size="sm" variant="ghost" onClick={onRequestIngredient} title="Notify storekeeper">Need ingr.</Button>
          <Button size="sm" variant="ghost" onClick={onRemake}>Remake</Button>
          <Button size="sm" variant="danger" onClick={onReject}>Reject</Button>
        </>
      )}
    </div>
  )
}

function LegendLine() {
  return (
    <div className="flex items-center gap-3 text-xs text-ink-500">
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" /> &lt;2m</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> 2–8m</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> late</span>
    </div>
  )
}
