import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Spinner } from '../../components/ui'
import ManagerPin from '../../components/ManagerPin'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listOrders, listOrderItems, listMenuItems, listTables, listPaymentsForOrder,
  updateOrderStatus, voidItem, fireCourse,
} from '../../lib/restaurant/store'
import type { MenuItem, Order, OrderItem, Payment, RestaurantTable } from '../../lib/restaurant/types'
import { MYR, minutesAgo, shortTime } from '../../lib/restaurant/format'
import { getOrderBuyerFields, getSubmissionByOrder, type OrderBuyerFields, type MyInvoisSubmission } from '../../lib/restaurant/einvoice'

export default function Orders() {
  const { branchId, employee } = useRestaurant()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [items, setItems]   = useState<MenuItem[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('active')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [lines, setLines] = useState<Record<string, OrderItem[]>>({})
  const [pays, setPays]   = useState<Record<string, Payment[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [voidPending, setVoidPending] = useState<{ itemId: string; orderId: string; branchId: string } | null>(null)

  const refresh = async () => {
    if (!branchId) return
    setLoading(true); setError(null)
    try {
      const [o, m, t] = await Promise.all([
        listOrders(branchId, 200),
        listMenuItems(branchId),
        listTables(branchId),
      ])
      setOrders(o); setItems(m); setTables(t)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [branchId])

  const expand = async (id: string) => {
    setExpanded(expanded === id ? null : id)
    if (!lines[id]) {
      const [li, py] = await Promise.all([listOrderItems(id), listPaymentsForOrder(id)])
      setLines((p) => ({ ...p, [id]: li }))
      setPays((p) => ({ ...p, [id]: py }))
    }
  }

  const filtered = orders.filter((o) => {
    if (filter === 'active') return !['paid', 'closed', 'voided'].includes(o.status)
    if (filter === 'closed') return ['paid', 'closed', 'voided'].includes(o.status)
    return true
  })

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading && orders.length === 0) return <div className="py-10 text-center text-ink-500"><Spinner /> Loading…</div>

  return (
    <div className="space-y-4">
      {error && <Alert tone="red">{error}</Alert>}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['all', 'active', 'closed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                filter === f ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
              }`}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refresh()}>Refresh</Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No orders" description="Place one from the Kiosk." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((o) => {
            const isOpen = expanded === o.id
            const tbl = tables.find((t) => t.id === o.table_id)
            return (
              <Card key={o.id} className={(() => {
                const lis = lines[o.id] ?? []
                const heldOver15 = lis.some((li) => li.status === 'held' && minutesAgo(o.created_at) > 15)
                return heldOver15 ? 'border-amber-400 ring-1 ring-amber-200' : ''
              })()}>
                <CardBody className="p-4">
                  <button onClick={() => void expand(o.id)} className="w-full flex items-center justify-between gap-4 text-left">
                    <div>
                      <div className="font-display text-lg flex items-center gap-2">
                        #{o.id.slice(0, 8)}
                        {(() => {
                          const lis = lines[o.id] ?? []
                          const heldOver15 = lis.some((li) => li.status === 'held' && minutesAgo(o.created_at) > 15)
                          return heldOver15 ? <Badge tone="amber">Pacing alert</Badge> : null
                        })()}
                      </div>
                      <div className="text-xs text-ink-500">
                        {o.order_type}
                        {tbl && <> · Table {tbl.table_number}</>}
                        {o.customer_name && <> · {o.customer_name}</>}
                        <> · {shortTime(o.created_at)} ({minutesAgo(o.created_at)}m ago)</>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <OrderBadge status={o.status} />
                      <span className="font-display">{MYR(Number(o.total))}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t text-sm">
                      <EinvoiceInline orderId={o.id} />
                      {(lines[o.id] ?? []).length === 0 ? (
                        <div className="text-ink-500">Loading items…</div>
                      ) : (
                        <ul className="space-y-1 mb-3">
                          {(lines[o.id] ?? []).map((li) => {
                            const mi = items.find((x) => x.id === li.menu_item_id)
                            return (
                              <li key={li.id} className="flex items-center justify-between">
                                <div>
                                  <span className="font-medium">{li.quantity}× {mi?.name ?? 'Item'}</span>
                                  <Badge tone={li.status === 'voided' ? 'red' : li.status === 'ready' ? 'green' : li.status === 'served' ? 'gray' : 'amber'} className="ml-2">{li.status}</Badge>
                                  {li.special_instruction && <div className="text-xs text-ink-500 italic">Note: {li.special_instruction}</div>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-ink-500">{MYR(li.quantity * (Number(li.unit_price) + Number(li.modifiers_total)))}</span>
                                  {li.status !== 'voided' && (
                                    <button
                                      className="text-xs text-red-500"
                                      onClick={() => setVoidPending({ itemId: li.id, orderId: o.id, branchId: o.branch_id })}
                                    >
                                      Void
                                    </button>
                                  )}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}

                      {(pays[o.id] ?? []).length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-ink-500 uppercase tracking-wide">Payments</div>
                          <ul>
                            {(pays[o.id] ?? []).map((p) => (
                              <li key={p.id} className="flex items-center justify-between">
                                <span>{p.method}</span>
                                <span>{MYR(Number(p.amount))}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {o.status !== 'paid' && o.status !== 'closed' && (
                          <>
                            <Button size="sm" variant="secondary" onClick={async () => {
                              await fireCourse(o.id, 'main', employee?.id ?? null)
                              const li2 = await listOrderItems(o.id)
                              setLines((p) => ({ ...p, [o.id]: li2 }))
                            }}>
                              Fire mains
                            </Button>
                            <Button size="sm" variant="secondary" onClick={async () => {
                              await fireCourse(o.id, 'dessert', employee?.id ?? null)
                              const li2 = await listOrderItems(o.id)
                              setLines((p) => ({ ...p, [o.id]: li2 }))
                            }}>
                              Fire desserts
                            </Button>
                          </>
                        )}
                        {o.status !== 'closed' && (
                          <Button size="sm" variant="ghost" onClick={async () => { await updateOrderStatus(o.id, 'closed'); await refresh() }}>
                            Close order
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </ul>
      )}

      <ManagerPin
        open={voidPending != null}
        branchId={voidPending?.branchId ?? ''}
        action="void_item"
        entityType="order_item"
        entityId={voidPending?.itemId}
        onApprove={async () => {
          if (!voidPending) return
          const reason = (document.querySelector<HTMLTextAreaElement>('textarea')?.value) || 'Manager-approved void'
          await voidItem(voidPending.itemId, reason, employee?.id ?? null)
          const [li2, py2] = await Promise.all([listOrderItems(voidPending.orderId), listPaymentsForOrder(voidPending.orderId)])
          setLines((p) => ({ ...p, [voidPending.orderId]: li2 }))
          setPays((p) => ({ ...p, [voidPending.orderId]: py2 }))
          setVoidPending(null)
        }}
        onCancel={() => setVoidPending(null)}
      />
    </div>
  )
}

function EinvoiceInline({ orderId }: { orderId: string }) {
  const [buyer, setBuyer] = useState<OrderBuyerFields | null>(null)
  const [sub, setSub]     = useState<MyInvoisSubmission | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([getOrderBuyerFields(orderId), getSubmissionByOrder(orderId)])
      .then(([b, s]) => { if (alive) { setBuyer(b); setSub(s) } })
      .catch(() => {})
    return () => { alive = false }
  }, [orderId])

  if (!buyer && !sub) return null
  const tone = sub?.submission_status === 'validated' ? 'green'
             : sub?.submission_status === 'failed' || sub?.submission_status === 'escalated' ? 'red'
             : 'amber'

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      {buyer && (
        <Badge tone={buyer.buyer_classification === 'b2c' ? 'gray' : 'brand'}>
          {buyer.buyer_classification.toUpperCase()}
          {buyer.buyer_tin ? ` · ${buyer.buyer_tin}` : ''}
        </Badge>
      )}
      {sub && (
        <>
          <Badge tone={tone}>e-invoice: {sub.submission_status}</Badge>
          {sub.uin && <span className="font-mono text-ink-700">UIN: {sub.uin}</span>}
        </>
      )}
    </div>
  )
}

function OrderBadge({ status }: { status: Order['status'] }) {
  const map: Record<Order['status'], { tone: 'gray' | 'brand' | 'green' | 'amber' | 'red'; label: string }> = {
    active:  { tone: 'brand',  label: 'Active' },
    sent:    { tone: 'amber',  label: 'Sent' },
    partial: { tone: 'amber',  label: 'Partial' },
    ready:   { tone: 'green',  label: 'Ready' },
    served:  { tone: 'green',  label: 'Served' },
    paid:    { tone: 'gray',   label: 'Paid' },
    closed:  { tone: 'gray',   label: 'Closed' },
    voided:  { tone: 'red',    label: 'Voided' },
  }
  const v = map[status]
  return <Badge tone={v.tone}>{v.label}</Badge>
}
