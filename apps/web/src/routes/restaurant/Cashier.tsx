import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Select, Spinner } from '../../components/ui'
import ManagerPin from '../../components/ManagerPin'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listActiveOrders, listOrderItems, listTables, listMenuItems,
  listPaymentsForOrder, createPayment, refundPayment,
  updateOrderStatus, updateOrder, updateTableStatus,
  getOpenShift, openShift, closeShift, listPayments,
  logAudit,
} from '../../lib/restaurant/store'
import type {
  MenuItem, Order, OrderItem, Payment, PaymentMethod, RestaurantTable, CashierShift,
} from '../../lib/restaurant/types'
import { MYR, minutesAgo } from '../../lib/restaurant/format'
import {
  getSubmissionByOrder, triggerSubmit, getOrderBuyerFields, updateOrderBuyerFields,
  type MyInvoisSubmission, type BuyerClassification,
} from '../../lib/restaurant/einvoice'

export default function Cashier() {
  const { branchId, employee } = useRestaurant()
  const [orders, setOrders] = useState<Order[]>([])
  const [items, setItems]   = useState<MenuItem[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [lines, setLines]   = useState<Record<string, OrderItem[]>>({})
  const [pays, setPays]     = useState<Record<string, Payment[]>>({})
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [shift, setShift]   = useState<CashierShift | null>(null)

  const refresh = async () => {
    if (!branchId) return
    setLoading(true); setError(null)
    try {
      const [o, m, t] = await Promise.all([listActiveOrders(branchId), listMenuItems(branchId), listTables(branchId)])
      setOrders(o); setItems(m); setTables(t)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void refresh() }, [branchId])

  useEffect(() => {
    if (!branchId || !employee) { setShift(null); return }
    void getOpenShift(branchId, employee.id).then(setShift).catch(() => setShift(null))
  }, [branchId, employee?.id])

  useEffect(() => {
    if (!active) return
    void (async () => {
      const [li, py] = await Promise.all([listOrderItems(active), listPaymentsForOrder(active)])
      setLines((p) => ({ ...p, [active]: li }))
      setPays((p) => ({ ...p, [active]: py }))
    })()
  }, [active])

  const filtered = orders.filter((o) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      o.id.toLowerCase().includes(q) ||
      (o.customer_name ?? '').toLowerCase().includes(q) ||
      (o.customer_phone ?? '').includes(q) ||
      (tables.find((t) => t.id === o.table_id)?.table_number ?? '').toLowerCase().includes(q)
    )
  })
  const activeOrder = orders.find((o) => o.id === active) ?? null
  const activeTable = activeOrder ? tables.find((t) => t.id === activeOrder.table_id) ?? null : null

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading && orders.length === 0) return <div className="py-10 text-center"><Spinner /> Loading…</div>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Order list */}
      <div>
        <Card>
          <CardBody>
            <h2 className="font-display text-lg mb-3">Open orders</h2>
            <input
              type="search"
              placeholder="Search table, name, phone, id…"
              className="w-full mb-3"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {filtered.length === 0 ? (
              <div className="text-sm text-ink-500 py-6 text-center">No matching orders</div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((o) => {
                  const tbl = tables.find((t) => t.id === o.table_id)
                  return (
                    <li key={o.id}>
                      <button
                        onClick={() => setActive(o.id)}
                        className={`w-full text-left p-2 rounded-md border ${
                          active === o.id ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:bg-ink-50'
                        }`}
                      >
                        <div className="flex justify-between">
                          <div>
                            <div className="font-medium">
                              {tbl ? `Table ${tbl.table_number}` : o.order_type}
                              {o.customer_name && ` · ${o.customer_name}`}
                            </div>
                            <div className="text-xs text-ink-500">#{o.id.slice(0,6)} · {minutesAgo(o.created_at)}m</div>
                          </div>
                          <div className="font-display">{MYR(Number(o.total))}</div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <ShiftCard
          shift={shift}
          onChanged={async () => {
            if (branchId && employee) setShift(await getOpenShift(branchId, employee.id))
          }}
          branchId={branchId}
        />
      </div>

      {/* Active order detail + payment */}
      <div className="lg:col-span-2">
        {!activeOrder ? (
          <EmptyState title="Select an order" description="Pick an open order from the list to collect payment." />
        ) : (
          <OrderPay
            order={activeOrder}
            table={activeTable}
            items={lines[activeOrder.id] ?? []}
            menuItems={items}
            payments={pays[activeOrder.id] ?? []}
            shiftActive={!!shift}
            onRefresh={async () => {
              const [li, py] = await Promise.all([listOrderItems(activeOrder.id), listPaymentsForOrder(activeOrder.id)])
              setLines((p) => ({ ...p, [activeOrder.id]: li }))
              setPays((p) => ({ ...p, [activeOrder.id]: py }))
              await refresh()
            }}
          />
        )}
        {error && <div className="mt-4"><Alert tone="red">{error}</Alert></div>}
      </div>
    </div>
  )
}

function OrderPay({
  order, table, items, menuItems, payments, onRefresh, shiftActive,
}: {
  order: Order
  table: RestaurantTable | null
  items: OrderItem[]
  menuItems: MenuItem[]
  payments: Payment[]
  onRefresh: () => Promise<void>
  shiftActive: boolean
}) {
  const { employee } = useRestaurant()
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [amount, setAmount] = useState('')
  const [tip, setTip]       = useState('')
  const [refundOpenFor, setRefundOpenFor] = useState<Payment | null>(null)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [splitItemsOpen, setSplitItemsOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [splitCount, setSplitCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)

  const paid = payments.filter((p) => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0)
  const remaining = Math.max(0, Number(order.total) - paid)

  const applyTip = async (t: number) => {
    const newTip = Math.round(t * 100) / 100
    const newTotal = Number(order.subtotal) - Number(order.discount) + Number(order.tax) + newTip + Number(order.delivery_fee ?? 0)
    await updateOrder(order.id, { tip: newTip, total: newTotal })
    setTip('')
    await onRefresh()
  }

  const submitPayment = async () => {
    if (!shiftActive && method === 'cash') { setErr('Open a cashier shift before accepting cash'); return }
    const amt = Math.round(parseFloat(amount || String(remaining)) * 100) / 100
    if (!Number.isFinite(amt) || amt <= 0) { setErr('Enter a valid amount'); return }
    setBusy(true); setErr(null)
    try {
      await createPayment({
        order_id: order.id,
        amount: amt,
        method,
        status: 'completed',
        receipt_no: `R-${Date.now().toString(36).toUpperCase()}`,
        processed_by: employee?.id ?? null,
      })
      const newPaid = paid + amt
      if (newPaid >= Number(order.total) - 0.009) {
        await updateOrderStatus(order.id, 'paid')
        if (order.table_id && table?.status === 'occupied') {
          await updateTableStatus(order.table_id, 'cleaning')
        }
        await logAudit({
          branch_id: order.branch_id,
          employee_id: employee?.id ?? null,
          action: 'order_paid',
          entity_type: 'orders',
          entity_id: order.id,
          new_value: { total: order.total, method },
        })
      }
      setAmount('')
      await onRefresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const splitEqually = async () => {
    const share = Math.round((remaining / splitCount) * 100) / 100
    if (share <= 0) return
    for (let i = 0; i < splitCount; i++) {
      await createPayment({
        order_id: order.id,
        amount: i === splitCount - 1 ? remaining - share * (splitCount - 1) : share,
        method,
        status: 'completed',
        receipt_no: `R-${Date.now().toString(36).toUpperCase()}-${i + 1}`,
        processed_by: employee?.id ?? null,
      })
    }
    await updateOrderStatus(order.id, 'paid')
    if (order.table_id && table?.status === 'occupied') {
      await updateTableStatus(order.table_id, 'cleaning')
    }
    await onRefresh()
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-display text-xl">Order #{order.id.slice(0,8)}</h2>
            <div className="text-sm text-ink-500">
              {order.order_type}
              {table && <> · Table {table.table_number}</>}
              {order.customer_name && <> · {order.customer_name}</>}
            </div>
          </div>
          <Badge tone={order.status === 'paid' ? 'gray' : 'brand'}>{order.status}</Badge>
        </div>

        <BuyerFieldsPanel orderId={order.id} />
        <EinvoiceBadge orderId={order.id} orderStatus={order.status} />

        <ul className="space-y-1 mb-3">
          {items.map((li) => {
            const mi = menuItems.find((m) => m.id === li.menu_item_id)
            return (
              <li key={li.id} className="flex justify-between text-sm">
                <span className={li.status === 'voided' ? 'line-through text-ink-400' : ''}>
                  {li.quantity}× {mi?.name ?? 'Item'}
                </span>
                <span>{MYR(li.quantity * (Number(li.unit_price) + Number(li.modifiers_total)))}</span>
              </li>
            )
          })}
        </ul>

        {order.status !== 'paid' && order.status !== 'closed' && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => setAddItemOpen(true)}>+ Add item</Button>
            <Button size="sm" variant="ghost" onClick={async () => {
              // Quick-reorder: clone all non-voided lines as new items, fire kitchen tickets.
              const { reorderToOpenOrder } = await import('../../lib/restaurant/store')
              const n = await reorderToOpenOrder(order.id, employee?.id ?? null)
              await onRefresh()
              if (n === 0) window.alert('Nothing to reorder')
            }}>Reorder same</Button>
          </div>
        )}

        {addItemOpen && (
          <AddItemPicker
            menuItems={menuItems}
            onCancel={() => setAddItemOpen(false)}
            onPick={async (mi, qty) => {
              const { addItemToOrder } = await import('../../lib/restaurant/store')
              await addItemToOrder(order.id, mi.id, qty, Number(mi.price), mi.station ?? 'kitchen', mi.course_type ?? 'any')
              setAddItemOpen(false)
              await onRefresh()
            }}
          />
        )}

        <dl className="text-sm space-y-1 mb-4 border-t pt-3">
          <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd>{MYR(Number(order.subtotal))}</dd></div>
          {Number(order.discount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>−{MYR(Number(order.discount))}</dd></div>}
          <div className="flex justify-between"><dt className="text-ink-500">Tax</dt><dd>{MYR(Number(order.tax))}</dd></div>
          {Number(order.tip) > 0 && <div className="flex justify-between"><dt className="text-ink-500">Tip</dt><dd>{MYR(Number(order.tip))}</dd></div>}
          <div className="flex justify-between font-display text-lg"><dt>Total</dt><dd>{MYR(Number(order.total))}</dd></div>
          <div className="flex justify-between text-ink-500"><dt>Paid</dt><dd>{MYR(paid)}</dd></div>
          <div className="flex justify-between text-lg"><dt>Balance</dt><dd>{MYR(remaining)}</dd></div>
        </dl>

        {remaining > 0 && (
          <>
            <div className="flex gap-2 mb-3">
              <span className="text-sm text-ink-500 self-center">Tip:</span>
              {[0, 0.05, 0.10, 0.15].map((p) => (
                <button key={p} className="btn-ghost btn-sm" type="button"
                  onClick={() => applyTip(p * Number(order.subtotal))}>{p === 0 ? 'None' : `${p * 100}%`}</button>
              ))}
              <input type="number" step="0.01" placeholder="Custom" className="text-sm w-20"
                value={tip} onChange={(e) => setTip(e.target.value)}
                onBlur={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) void applyTip(v) }} />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="qr">QR</option>
                <option value="gift_card">Gift card</option>
                <option value="loyalty">Loyalty</option>
                <option value="voucher">Voucher</option>
                <option value="bank_transfer">Bank transfer</option>
              </Select>
              <Input label="Amount" type="number" step="0.01" placeholder={String(remaining.toFixed(2))}
                value={amount} onChange={(e) => setAmount(e.target.value)} />
              <div className="flex items-end">
                <Button className="w-full" onClick={submitPayment} loading={busy}>
                  Pay {MYR(parseFloat(amount) || remaining)}
                </Button>
              </div>
            </div>

            <div className="flex items-end gap-2 mb-3 flex-wrap">
              <Input label="Split by" type="number" min={1} max={10} value={String(splitCount)} onChange={(e) => setSplitCount(parseInt(e.target.value) || 1)} />
              <Button variant="secondary" onClick={splitEqually}>Split equally</Button>
              <Button variant="secondary" onClick={() => setSplitItemsOpen(true)} disabled={items.filter((i) => i.status !== 'voided').length === 0}>Split by items</Button>
              <Button variant="ghost" onClick={() => setDiscountOpen(true)}>Apply discount</Button>
            </div>

            {splitItemsOpen && (
              <SplitByItems
                items={items.filter((i) => i.status !== 'voided')}
                menuItems={menuItems}
                onCancel={() => setSplitItemsOpen(false)}
                onPay={async (selected, amt) => {
                  await createPayment({
                    order_id: order.id, amount: amt, method,
                    status: 'completed',
                    receipt_no: `R-${Date.now().toString(36).toUpperCase()}-S`,
                    processed_by: employee?.id ?? null,
                  })
                  // Track which items were settled in payment.reference (best-effort)
                  await logAudit({
                    branch_id: order.branch_id, employee_id: employee?.id ?? null,
                    action: 'split_pay', entity_type: 'orders', entity_id: order.id,
                    new_value: { items: selected, amount: amt },
                  })
                  setSplitItemsOpen(false)
                  await onRefresh()
                }}
              />
            )}
          </>
        )}

        {payments.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-xs text-ink-500 uppercase tracking-wide mb-2">Payments</div>
            <ul className="space-y-1 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span className={p.status === 'refunded' ? 'line-through' : ''}>
                    {p.method} · {MYR(Number(p.amount))}
                    {p.receipt_no && <span className="ml-2 text-xs text-ink-400">{p.receipt_no}</span>}
                  </span>
                  {p.status === 'completed' && (
                    <button className="text-xs text-red-500" onClick={() => setRefundOpenFor(p)}>
                      Refund
                    </button>
                  )}
                  {p.status === 'refunded' && <span className="text-xs text-red-500">refunded</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {err && <div className="mt-3"><Alert tone="red">{err}</Alert></div>}

        <ManagerPin
          open={refundOpenFor != null}
          branchId={order.branch_id}
          action="refund"
          entityType="payment"
          entityId={refundOpenFor?.id}
          onApprove={async () => {
            if (!refundOpenFor) return
            const reasonEl = document.querySelector<HTMLTextAreaElement>('textarea')
            const reason = reasonEl?.value || 'Manager-approved refund'
            await refundPayment(refundOpenFor.id, employee?.id ?? null, reason)
            await logAudit({
              branch_id: order.branch_id, employee_id: employee?.id ?? null,
              action: 'refund', entity_type: 'payment', entity_id: refundOpenFor.id,
              reason, new_value: { amount: refundOpenFor.amount },
            })
            setRefundOpenFor(null)
            await onRefresh()
          }}
          onCancel={() => setRefundOpenFor(null)}
        />

        <ManagerPin
          open={discountOpen}
          branchId={order.branch_id}
          action="discount_override"
          entityType="orders"
          entityId={order.id}
          onApprove={async () => {
            const v = window.prompt('Discount amount (RM):', '0')
            const amt = parseFloat(v ?? '0')
            if (!Number.isFinite(amt) || amt <= 0) { setDiscountOpen(false); return }
            const newDiscount = Number(order.discount) + amt
            const newTotal = Number(order.subtotal) - newDiscount + Number(order.tax) + Number(order.tip ?? 0) + Number(order.delivery_fee ?? 0)
            await updateOrder(order.id, { discount: newDiscount, total: Math.max(0, newTotal) })
            await logAudit({
              branch_id: order.branch_id, employee_id: employee?.id ?? null,
              action: 'discount_override', entity_type: 'orders', entity_id: order.id,
              reason: 'Cashier discount override', new_value: { discount_added: amt },
            })
            setDiscountOpen(false)
            await onRefresh()
          }}
          onCancel={() => setDiscountOpen(false)}
        />
      </CardBody>
    </Card>
  )
}

function EinvoiceBadge({ orderId, orderStatus }: { orderId: string; orderStatus: string }) {
  const [sub, setSub] = useState<MyInvoisSubmission | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const next = await getSubmissionByOrder(orderId)
        if (!alive) return
        setSub(next)
        if (next && (next.submission_status === 'pending' || next.submission_status === 'submitted')) {
          // Nudge it forward (no-op if edge fn already running)
          await triggerSubmit(next.id).catch(() => {})
        }
      } catch { /* swallow — view is non-fatal */ }
      finally { if (alive) setLoading(false) }
    }
    void tick()
    const id = setInterval(() => { void tick() }, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [orderId])

  if (loading && !sub) return null
  if (!sub) {
    if (orderStatus !== 'paid') return null
    return (
      <div className="mb-3 text-xs text-ink-400">
        E-invoice: <span className="italic">not configured</span> (admin must enable MyInvois)
      </div>
    )
  }

  const tone = sub.submission_status === 'validated' ? 'green'
             : sub.submission_status === 'failed' || sub.submission_status === 'escalated' ? 'red'
             : 'amber'
  const label = sub.submission_status === 'validated' ? 'E-invoice validated'
              : sub.submission_status === 'failed' ? 'E-invoice failed'
              : sub.submission_status === 'escalated' ? 'E-invoice escalated'
              : sub.submission_status === 'pending_retry' ? 'E-invoice queued for retry'
              : sub.submission_status === 'submitted' ? 'E-invoice submitting…'
              : 'E-invoice pending'

  return (
    <div className="mb-3 px-3 py-2 rounded-md border border-ink-200 bg-ink-50 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Badge tone={tone}>{label}</Badge>
        {sub.uin && <span className="text-xs font-mono text-ink-700">UIN: {sub.uin}</span>}
        {sub.attempt_count > 0 && sub.submission_status !== 'validated' && (
          <span className="text-xs text-ink-400">attempt {sub.attempt_count}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {sub.qr_code && (
          <a
            href={sub.qr_code}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline text-brand-700"
          >
            Verify QR
          </a>
        )}
        {(sub.submission_status === 'failed' || sub.submission_status === 'escalated') && (
          <button
            className="btn-ghost btn-sm"
            onClick={() => void triggerSubmit(sub.id)}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

function BuyerFieldsPanel({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false)
  const [classification, setClassification] = useState<BuyerClassification>('b2c')
  const [tin, setTin]         = useState('')
  const [name, setName]       = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail]     = useState('')
  const [regNo, setRegNo]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [msg, setMsg]         = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void getOrderBuyerFields(orderId).then((b) => {
      if (!alive || !b) return
      setClassification(b.buyer_classification)
      setTin(b.buyer_tin ?? '')
      setName(b.buyer_name ?? '')
      setAddress(b.buyer_address ?? '')
      setEmail(b.buyer_email ?? '')
      setRegNo(b.buyer_reg_no ?? '')
    }).catch(() => {})
    return () => { alive = false }
  }, [orderId])

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      await updateOrderBuyerFields(orderId, {
        buyer_classification: classification,
        buyer_tin: tin || null,
        buyer_name: name || null,
        buyer_address: address || null,
        buyer_email: email || null,
        buyer_reg_no: regNo || null,
      })
      setMsg('Saved.')
      setOpen(false)
    } catch (e) { setMsg((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="mb-3 text-xs">
      <button onClick={() => setOpen(!open)} className="text-ink-500 hover:text-ink-700 underline">
        Buyer: {classification.toUpperCase()}{tin ? ` · TIN ${tin}` : ''} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-2 p-3 border border-ink-200 rounded-md bg-white space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Select label="Classification" value={classification} onChange={(e) => setClassification(e.target.value as BuyerClassification)}>
              <option value="b2c">B2C (retail customer)</option>
              <option value="b2b">B2B (business)</option>
              <option value="b2g">B2G (government)</option>
            </Select>
            <Input label="TIN" value={tin} onChange={(e) => setTin(e.target.value)} placeholder="C12345678901" />
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Reg no. (SSM/foreign)" value={regNo} onChange={(e) => setRegNo(e.target.value)} />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {msg && <div className="text-ink-500">{msg}</div>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={busy}>Save buyer info</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ShiftCard({ shift, onChanged, branchId }: { shift: CashierShift | null; onChanged: () => Promise<void>; branchId: string }) {
  const { employee } = useRestaurant()
  const [openingFloat, setOpeningFloat] = useState('100')
  const [closingCash, setClosingCash]   = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg]   = useState<string | null>(null)

  if (!employee) {
    return (
      <Card className="mt-4"><CardBody>
        <div className="text-sm text-ink-500">Sign in with a staff PIN on the Staff tab to open a cashier shift.</div>
      </CardBody></Card>
    )
  }

  const doOpen = async () => {
    setBusy(true); setMsg(null)
    try {
      await openShift(branchId, employee.id, parseFloat(openingFloat) || 0)
      await onChanged()
      setMsg('Shift opened')
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  const doXReport = async () => {
    // live tally: count payments since shift opened
    const since = shift?.opened_at ?? new Date().toISOString()
    const pays = await listPayments(branchId, since)
    const tally = pays.reduce((acc, p) => {
      if (p.status !== 'completed') return acc
      acc.totals.count += 1
      acc.totals.amount += Number(p.amount)
      acc.by_method[p.method] = (acc.by_method[p.method] ?? 0) + Number(p.amount)
      return acc
    }, { totals: { count: 0, amount: 0 }, by_method: {} as Record<string, number> })
    alert(`X-report\nSince: ${new Date(since).toLocaleTimeString()}\nTxn: ${tally.totals.count}\nRevenue: ${MYR(tally.totals.amount)}\n` + Object.entries(tally.by_method).map(([m,v]) => `${m}: ${MYR(v)}`).join('\n'))
  }

  const [varianceGate, setVarianceGate] = useState<{ amount: number; expected: number; variance: number; cashSales: number; by: Record<string, number> } | null>(null)

  const doZ = async () => {
    if (!shift) return
    setBusy(true); setMsg(null)
    try {
      const pays = await listPayments(branchId, shift.opened_at)
      const by: Record<string, number> = {}
      let cashSales = 0
      pays.filter((p) => p.status === 'completed').forEach((p) => {
        by[p.method] = (by[p.method] ?? 0) + Number(p.amount)
        if (p.method === 'cash') cashSales += Number(p.amount)
      })
      const actual = parseFloat(closingCash) || 0
      const expected = Number(shift.opening_float) + cashSales
      const variance = actual - expected

      // Per spec SC-04: variance > $10 → manager approval required.
      if (Math.abs(variance) > 10) {
        setVarianceGate({ amount: actual, expected, variance, cashSales, by })
        setBusy(false)
        return
      }
      await closeShift(shift.id, actual, { cash_sales: cashSales, by_method: by, closed_at: new Date().toISOString() })
      await onChanged()
      setMsg('Shift closed (Z-report saved)')
      setClosingCash('')
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Card className="mt-4">
      <CardBody>
        <h3 className="font-display text-lg mb-2">Cashier shift</h3>
        {!shift ? (
          <>
            <Input label="Opening float (RM)" type="number" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
            <Button className="w-full" loading={busy} onClick={doOpen}>Open shift</Button>
          </>
        ) : (
          <>
            <div className="text-sm text-ink-500 mb-3">
              Opened {new Date(shift.opened_at).toLocaleString()} with float {MYR(Number(shift.opening_float))}
            </div>
            <div className="flex gap-2 mb-3 flex-wrap">
              <Button variant="secondary" onClick={doXReport}>X-report</Button>
              <Button variant="ghost" onClick={async () => {
                const { distributeTipPool } = await import('../../lib/restaurant/store')
                const r = await distributeTipPool(branchId, shift.opened_at)
                setMsg(r.total > 0 ? `Tip pool: ${MYR(r.total)} → ${r.allocations.map((a) => `${a.name} ${MYR(a.share)}`).join(', ')}` : 'No tips collected this shift.')
              }}>Distribute tips</Button>
            </div>
            <Input label="Actual cash in drawer (RM)" type="number" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} />
            <Button variant="danger" className="w-full" loading={busy} onClick={doZ}>Close shift (Z-report)</Button>
          </>
        )}
        {msg && <div className="mt-2 text-sm">{msg}</div>}

        <ManagerPin
          open={varianceGate != null}
          branchId={branchId}
          action="shift_variance"
          entityType="cashier_shift"
          entityId={shift?.id}
          reason={varianceGate ? `Cash variance ${MYR(varianceGate.variance)} (expected ${MYR(varianceGate.expected)}, actual ${MYR(varianceGate.amount)})` : ''}
          onApprove={async () => {
            if (!shift || !varianceGate) return
            await closeShift(shift.id, varianceGate.amount, {
              cash_sales: varianceGate.cashSales,
              by_method: varianceGate.by,
              closed_at: new Date().toISOString(),
              approved_variance: varianceGate.variance,
            })
            await onChanged()
            setMsg(`Shift closed with manager-approved variance ${MYR(varianceGate.variance)}`)
            setVarianceGate(null)
            setClosingCash('')
          }}
          onCancel={() => setVarianceGate(null)}
        />
      </CardBody>
    </Card>
  )
}

function SplitByItems({
  items, menuItems, onCancel, onPay,
}: {
  items: OrderItem[]
  menuItems: MenuItem[]
  onCancel: () => void
  onPay: (selectedIds: string[], amount: number) => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const total = items.filter((i) => selected.has(i.id))
    .reduce((s, li) => s + li.quantity * (Number(li.unit_price) + Number(li.modifiers_total)), 0)
  return (
    <div className="card-elevated p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-display">Pick items for this payment</h4>
        <span className="font-display text-lg">{MYR(total)}</span>
      </div>
      <ul className="divide-y divide-ink-100 mb-3">
        {items.map((li) => {
          const mi = menuItems.find((m) => m.id === li.menu_item_id)
          const checked = selected.has(li.id)
          return (
            <li key={li.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => {
                  setSelected((p) => {
                    const n = new Set(p); n.has(li.id) ? n.delete(li.id) : n.add(li.id); return n
                  })
                }} />
                <span>{li.quantity}× {mi?.name ?? 'Item'}</span>
              </label>
              <span className="text-ink-500">{MYR(li.quantity * (Number(li.unit_price) + Number(li.modifiers_total)))}</span>
            </li>
          )
        })}
      </ul>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="brand" disabled={total <= 0} onClick={() => onPay(Array.from(selected), total)}>
          Charge {MYR(total)}
        </Button>
      </div>
    </div>
  )
}

function AddItemPicker({
  menuItems, onCancel, onPick,
}: {
  menuItems: MenuItem[]
  onCancel: () => void
  onPick: (m: MenuItem, qty: number) => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<MenuItem | null>(null)
  const [qty, setQty] = useState(1)
  const list = q.trim()
    ? menuItems.filter((m) => m.is_active && m.name.toLowerCase().includes(q.toLowerCase()))
    : menuItems.filter((m) => m.is_active).slice(0, 12)
  return (
    <div className="card-elevated p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-display">Add item to this order</h4>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
      <input className="w-full mb-3" placeholder="Search menu…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
        {list.map((m) => (
          <button key={m.id} type="button" onClick={() => setPicked(m)}
            className={`card p-2 text-left text-sm hover:border-ink-300 ${picked?.id === m.id ? 'ring-2 ring-brand-500' : ''}`}>
            <div className="font-medium">{m.name}</div>
            <div className="text-xs text-ink-500">{MYR(Number(m.price))} · {m.station ?? 'kitchen'}</div>
          </button>
        ))}
      </div>
      {picked && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm">Qty</span>
          <input type="number" min={1} max={20} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-20 text-sm" />
          <Button onClick={() => void onPick(picked, qty)}>Add {picked.name} × {qty}</Button>
        </div>
      )}
    </div>
  )
}
