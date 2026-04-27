import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Select, Spinner } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listCategories, listMenuItems, listModifiersByItems,
  listTables, placeOrder, listPromotions, evaluatePromotion,
  findMembershipByPhone, awardPoints,
} from '../../lib/restaurant/store'
import type {
  CartLine, MenuCategory, MenuItem, Modifier, OrderType, Promotion, RestaurantTable,
} from '../../lib/restaurant/types'
import { MYR } from '../../lib/restaurant/format'

const TAX_RATE = 0.06

export default function Kiosk() {
  const { branchId, employee } = useRestaurant()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems]     = useState<MenuItem[]>([])
  const [modifiers, setModifiers] = useState<Modifier[]>([])
  const [tables, setTables]   = useState<RestaurantTable[]>([])
  const [promos, setPromos]   = useState<Promotion[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const [cart, setCart]       = useState<CartLine[]>([])
  const [orderType, setOrderType] = useState<OrderType>('dinein')
  const [tableId, setTableId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<Promotion | null>(null)
  const [configuring, setConfiguring] = useState<MenuItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    void (async () => {
      setLoading(true); setError(null)
      try {
        const [cats, mis, tbs, pros] = await Promise.all([
          listCategories(branchId),
          listMenuItems(branchId),
          listTables(branchId),
          listPromotions(branchId),
        ])
        if (cancelled) return
        setCategories(cats)
        setItems(mis)
        setTables(tbs)
        setPromos(pros)
        setActiveCategory(cats[0]?.id ?? null)
        const mods = await listModifiersByItems(mis.map((m) => m.id))
        if (!cancelled) setModifiers(mods)

        // Stock-availability check via SQL helper. We compute it client-side
        // for transparency + offline resilience: if it 404s we just show all.
        try {
          const { menuAvailability } = await import('../../lib/restaurant/store')
          const map = await menuAvailability(mis.map((m) => m.id), branchId)
          if (!cancelled) setAvailability(map)
        } catch { /* tolerate */ }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [branchId])

  const filteredItems = useMemo(() =>
    items.filter((i) => !activeCategory || i.category_id === activeCategory),
  [items, activeCategory])

  const subtotal = useMemo(() =>
    cart.reduce((s, l) =>
      s + l.quantity * (Number(l.menuItem.price) + l.modifiers.reduce((m, x) => m + Number(x.price_delta), 0)),
    0),
  [cart])

  // Server-side promo evaluator handles BOGO/combo/birthday/table-area;
  // we use the local JS one for time_based + coupon for instant UI feedback.
  const autoDiscount = useMemo(() => {
    const now = new Date()
    return promos
      .filter((p) => p.is_active && p.type === 'time_based')
      .reduce((sum, p) => sum + evaluatePromotion(p, subtotal, now), 0)
  }, [promos, subtotal])

  const couponDiscount = appliedCoupon ? evaluatePromotion(appliedCoupon, subtotal) : 0

  // Server-evaluated discounts (BOGO, combo, birthday, table_area) — refreshed on cart change.
  // Membership (and birthday boost) is resolved via customerPhone if provided.
  const [serverPromoDiscount, setServerPromoDiscount] = useState(0)
  const [serverPromoLabel, setServerPromoLabel] = useState<string | null>(null)
  useEffect(() => {
    if (cart.length === 0) { setServerPromoDiscount(0); setServerPromoLabel(null); return }
    let cancelled = false
    void (async () => {
      try {
        const { evaluateServerPromotions, findMembershipByPhone } = await import('../../lib/restaurant/store')
        const cartLines = cart.map((l) => ({
          menu_item_id: l.menuItem.id,
          quantity: l.quantity,
          unit_price: Number(l.menuItem.price),
        }))
        const tableArea = tables.find((t) => t.id === tableId)?.area ?? null
        let membershipId: string | null = null
        if (customerPhone.trim() && branchId) {
          const m = await findMembershipByPhone(branchId, customerPhone.trim())
          membershipId = m?.id ?? null
        }
        const out = await evaluateServerPromotions(promos, cartLines, subtotal, membershipId, tableArea)
        if (!cancelled) {
          setServerPromoDiscount(out.total)
          setServerPromoLabel(out.label)
        }
      } catch { /* tolerate */ }
    })()
    return () => { cancelled = true }
  }, [cart.map((l) => l.menuItem.id + ':' + l.quantity).join('|'), promos.length, tableId, subtotal, customerPhone, branchId, tables])

  const discount = Math.min(subtotal, autoDiscount + couponDiscount + serverPromoDiscount)
  const tax      = Math.round((subtotal - discount) * TAX_RATE * 100) / 100
  const total    = Math.round((subtotal - discount + tax) * 100) / 100

  const addToCart = (item: MenuItem, mods: Modifier[], note: string) => {
    setCart((prev) => [...prev, {
      tempKey: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      menuItem: item,
      quantity: 1,
      modifiers: mods,
      specialInstruction: note || undefined,
    }])
  }

  const updateQty = (k: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => l.tempKey === k ? { ...l, quantity: l.quantity + delta } : l)
        .filter((l) => l.quantity > 0),
    )
  }

  const removeLine = (k: string) => setCart((prev) => prev.filter((l) => l.tempKey !== k))

  const applyCoupon = () => {
    const p = promos.find((x) => x.code === couponCode.trim().toUpperCase() && x.is_active)
    if (!p) { setError('Coupon code invalid or expired'); setAppliedCoupon(null); return }
    setError(null); setAppliedCoupon(p)
  }

  const submit = async () => {
    if (!branchId) return
    if (cart.length === 0) { setError('Cart is empty'); return }
    if (orderType === 'dinein' && !tableId) { setError('Select a table for dine-in'); return }
    if (orderType === 'takeaway' && !customerName) { setError('Customer name required for takeaway'); return }
    if (orderType === 'delivery' && (!customerName || !deliveryAddress)) { setError('Name and address required for delivery'); return }
    setError(null); setSubmitting(true)
    try {
      // Membership (optional)
      let membershipId: string | null = null
      if (customerPhone) {
        const m = await findMembershipByPhone(branchId, customerPhone)
        if (m) membershipId = m.id
      }
      const order = await placeOrder({
        branch_id: branchId,
        order_type: orderType,
        table_id: tableId,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        pickup_time: pickupTime ? new Date(pickupTime).toISOString() : null,
        delivery_address: deliveryAddress || null,
        waiter_id: employee?.id ?? null,
        membership_id: membershipId,
        lines: cart,
        taxRate: TAX_RATE,
        discountAmount: discount,
      })
      if (membershipId) {
        try { await awardPoints(membershipId, Math.floor(total)) } catch { /* non-fatal */ }
      }
      setSuccess(`Order #${order.id.slice(0, 8)} sent to kitchen. Total ${MYR(total)}.`)
      setLastOrderId(order.id)
      setCart([]); setAppliedCoupon(null); setCouponCode('')
      setCustomerName(''); setCustomerPhone(''); setPickupTime(''); setDeliveryAddress('')
      if (orderType === 'dinein') setTableId(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading)   return <div className="py-10 text-center text-ink-500"><Spinner /> Loading menu…</div>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Menu */}
      <div className="lg:col-span-2">
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${
                activeCategory === c.id ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 ? (
          <EmptyState title="No items in this category" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredItems.map((m) => {
              const inStock = availability[m.id] !== false
              return (
                <Card key={m.id} hoverable className={!inStock ? 'opacity-50 grayscale' : ''}>
                  <CardBody className="p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg">{m.name}</h3>
                      <div className="flex flex-col items-end gap-1">
                        <Badge tone="brand">{m.course_type}</Badge>
                        {!inStock && <Badge tone="red">Out</Badge>}
                      </div>
                    </div>
                    {m.description && <p className="text-sm text-ink-500 line-clamp-2">{m.description}</p>}
                    <div className="flex items-center justify-between mt-auto pt-2">
                      <span className="font-display text-xl text-ink-900">{MYR(Number(m.price))}</span>
                      <Button size="sm" disabled={!inStock} onClick={() => inStock && setConfiguring(m)}>{inStock ? 'Add' : 'Unavailable'}</Button>
                    </div>
                  </CardBody>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Cart */}
      <div>
        <Card>
          <CardBody>
            <h2 className="font-display text-lg mb-4">Order</h2>

            <Select label="Order type" value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
              <option value="dinein">Dine in</option>
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </Select>

            {orderType === 'dinein' && (
              <Select label="Table" value={tableId ?? ''} onChange={(e) => setTableId(e.target.value || null)}>
                <option value="">Pick a table…</option>
                {tables.filter((t) => t.status === 'free' || t.id === tableId).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.table_number} · {t.area} · {t.capacity}p
                  </option>
                ))}
              </Select>
            )}

            {(orderType === 'takeaway' || orderType === 'delivery') && (
              <>
                <Input label="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
                <Input label="Phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional — for loyalty points" />
              </>
            )}
            {orderType === 'takeaway' && (
              <Input label="Pickup time" type="datetime-local" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
            )}
            {orderType === 'delivery' && (
              <Input label="Delivery address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} required />
            )}

            {orderType === 'dinein' && (
              <Input label="Phone (loyalty)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional — for loyalty points" />
            )}

            <hr className="my-4" />

            {cart.length === 0 ? (
              <p className="text-sm text-ink-500 text-center py-6">Cart is empty</p>
            ) : (
              <ul className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {cart.map((l) => {
                  const linePrice = l.quantity * (Number(l.menuItem.price) + l.modifiers.reduce((m, x) => m + Number(x.price_delta), 0))
                  return (
                    <li key={l.tempKey} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-medium">{l.menuItem.name}</div>
                          {l.modifiers.length > 0 && (
                            <div className="text-xs text-ink-500">{l.modifiers.map((m) => m.name).join(', ')}</div>
                          )}
                          {l.specialInstruction && (
                            <div className="text-xs text-amber-700 italic">Note: {l.specialInstruction}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div>{MYR(linePrice)}</div>
                          <div className="flex items-center gap-1 mt-1 justify-end">
                            <button onClick={() => updateQty(l.tempKey, -1)} className="w-6 h-6 rounded border">−</button>
                            <span className="w-6 text-center">{l.quantity}</span>
                            <button onClick={() => updateQty(l.tempKey,  1)} className="w-6 h-6 rounded border">+</button>
                            <button onClick={() => removeLine(l.tempKey)} className="ml-1 text-red-500 text-xs">✕</button>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="flex gap-2 mb-3">
              <input
                className="flex-1 text-sm"
                placeholder="Coupon code"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
              />
              <button className="btn-ghost btn-sm" onClick={applyCoupon} type="button">Apply</button>
            </div>
            {appliedCoupon && (
              <div className="text-xs text-emerald-700 mb-2">Coupon {appliedCoupon.code} applied.</div>
            )}

            <dl className="text-sm space-y-1">
              <div className="flex justify-between"><dt className="text-ink-500">{t('restaurant.kiosk.subtotal')}</dt><dd>{MYR(subtotal)}</dd></div>
              {autoDiscount > 0 && <div className="flex justify-between text-emerald-700"><dt>{t('restaurant.kiosk.happyHour')}</dt><dd>−{MYR(autoDiscount)}</dd></div>}
              {couponDiscount > 0 && <div className="flex justify-between text-emerald-700"><dt>{t('restaurant.kiosk.coupon')}</dt><dd>−{MYR(couponDiscount)}</dd></div>}
              {serverPromoDiscount > 0 && <div className="flex justify-between text-emerald-700"><dt>{serverPromoLabel ?? 'Promo'}</dt><dd>−{MYR(serverPromoDiscount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-500">{t('restaurant.kiosk.tax')} ({(TAX_RATE * 100).toFixed(0)}%)</dt><dd>{MYR(tax)}</dd></div>
              <div className="flex justify-between font-display text-lg pt-2 border-t"><dt>{t('restaurant.kiosk.total')}</dt><dd>{MYR(total)}</dd></div>
            </dl>

            {error   && <div className="mt-3"><Alert tone="red">{error}</Alert></div>}
            {success && (
              <div className="mt-3">
                <Alert tone="green" title={t('restaurant.kiosk.orderPlaced')}>{success}</Alert>
                {lastOrderId && (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <img
                      alt="Track this order"
                      width={140}
                      height={140}
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`${window.location.origin}/restaurant/track/${lastOrderId}`)}`}
                    />
                    <a className="text-xs text-brand-700 underline-offset-2 hover:underline"
                       href={`/restaurant/track/${lastOrderId}`} target="_blank" rel="noreferrer">
                      {t('restaurant.kiosk.trackOrder')} →
                    </a>
                  </div>
                )}
                <button className="btn-secondary btn-sm mt-2" onClick={() => { setSuccess(null); setLastOrderId(null); navigate('/restaurant/orders') }}>{t('restaurant.kiosk.viewOrders')}</button>
              </div>
            )}

            <Button
              className="mt-4 w-full"
              onClick={submit}
              loading={submitting}
              disabled={cart.length === 0 || submitting}
            >
              Place order · {MYR(total)}
            </Button>
          </CardBody>
        </Card>
      </div>

      {configuring && (
        <ConfigureModal
          item={configuring}
          modifiers={modifiers.filter((m) => m.menu_item_id === configuring.id)}
          onClose={() => setConfiguring(null)}
          onAdd={(mods, note) => { addToCart(configuring, mods, note); setConfiguring(null) }}
        />
      )}
    </div>
  )
}

function ConfigureModal({
  item, modifiers, onClose, onAdd,
}: {
  item: MenuItem
  modifiers: Modifier[]
  onClose: () => void
  onAdd: (mods: Modifier[], note: string) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })
  const selectedMods = modifiers.filter((m) => selected.has(m.id))
  const priceDelta = selectedMods.reduce((s, m) => s + Number(m.price_delta), 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-display text-xl">{item.name}</h3>
              {item.description && <p className="text-sm text-ink-500">{item.description}</p>}
            </div>
            <button onClick={onClose} className="text-2xl leading-none text-ink-400 hover:text-ink-700">×</button>
          </div>

          {modifiers.length > 0 ? (
            <div className="space-y-2 mb-4">
              <div className="text-sm font-medium">Modifiers</div>
              {modifiers.map((m) => (
                <label key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                    {m.name}
                  </span>
                  <span className="text-ink-500">{Number(m.price_delta) === 0 ? '—' : `+${MYR(Number(m.price_delta))}`}</span>
                </label>
              ))}
            </div>
          ) : null}

          <Input label="Special instruction" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no onions" />

          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <span className="font-display text-lg">{MYR(Number(item.price) + priceDelta)}</span>
            <Button onClick={() => onAdd(selectedMods, note)}>Add to order</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
