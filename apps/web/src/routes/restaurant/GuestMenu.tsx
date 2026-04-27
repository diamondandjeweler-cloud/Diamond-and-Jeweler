import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { placeGuestOrder } from '../../lib/restaurant/store'
import { MYR } from '../../lib/restaurant/format'
import type { Branch, CartLine, MenuCategory, MenuItem, Modifier, RestaurantTable } from '../../lib/restaurant/types'

const TAX_RATE = 0.06

export default function GuestMenu() {
  const { branchId } = useParams<{ branchId: string }>()
  const [searchParams] = useSearchParams()
  const tableId = searchParams.get('table')

  const [branch, setBranch]       = useState<Branch | null>(null)
  const [table, setTable]         = useState<RestaurantTable | null>(null)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems]         = useState<MenuItem[]>([])
  const [modifiers, setModifiers] = useState<Modifier[]>([])
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [err, setErr]             = useState<string | null>(null)

  const [cart, setCart]           = useState<CartLine[]>([])
  const [stage, setStage]         = useState<'menu' | 'checkout' | 'success'>('menu')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [placing, setPlacing]     = useState(false)
  const [orderId, setOrderId]     = useState<string | null>(null)
  const [configuring, setConfiguring] = useState<MenuItem | null>(null)

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    const load = async () => {
      setLoading(true); setErr(null)
      try {
        const db = supabase.schema('restaurant' as never) as unknown as ReturnType<typeof supabase.schema>
        const [br, cats, mis] = await Promise.all([
          db.from('branch').select('*').eq('id', branchId).maybeSingle(),
          db.from('menu_category').select('*').eq('branch_id', branchId).order('sort_order'),
          db.from('menu_item').select('*').eq('branch_id', branchId).eq('is_active', true).order('name'),
        ])
        if (br.error) throw br.error
        if (cats.error) throw cats.error
        if (mis.error) throw mis.error

        const itemIds = ((mis.data ?? []) as MenuItem[]).map((m) => m.id)
        let mods: Modifier[] = []
        if (itemIds.length) {
          const { data, error } = await db.from('modifier').select('*').in('menu_item_id', itemIds).eq('is_active', true)
          if (error) throw error
          mods = (data ?? []) as Modifier[]
        }

        let tbl: RestaurantTable | null = null
        if (tableId) {
          const { data } = await db.from('restaurant_table').select('*').eq('id', tableId).maybeSingle()
          tbl = (data as RestaurantTable) ?? null
        }

        if (!cancelled) {
          setBranch(br.data as Branch)
          setCategories((cats.data ?? []) as MenuCategory[])
          setItems((mis.data ?? []) as MenuItem[])
          setModifiers(mods)
          setActiveCat(((cats.data ?? []) as MenuCategory[])[0]?.id ?? null)
          setTable(tbl)
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [branchId, tableId])

  const filteredItems = useMemo(
    () => items.filter((i) => !activeCat || i.category_id === activeCat),
    [items, activeCat],
  )

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0)
  const subtotal  = cart.reduce((s, l) =>
    s + l.quantity * (Number(l.menuItem.price) + l.modifiers.reduce((m, x) => m + Number(x.price_delta), 0)), 0)
  const tax   = Math.round(subtotal * TAX_RATE * 100) / 100
  const total = Math.round((subtotal + tax) * 100) / 100

  const addToCart = (item: MenuItem, mods: Modifier[], note: string) => {
    setCart((prev) => [...prev, {
      tempKey: `${item.id}-${Date.now()}`,
      menuItem: item,
      quantity: 1,
      modifiers: mods,
      specialInstruction: note || undefined,
    }])
  }

  const updateQty = (k: string, delta: number) =>
    setCart((prev) =>
      prev.map((l) => l.tempKey === k ? { ...l, quantity: l.quantity + delta } : l)
          .filter((l) => l.quantity > 0),
    )

  const submit = async () => {
    if (!branchId || cart.length === 0) return
    if (!customerName.trim()) { setErr('Please enter your name'); return }
    setErr(null); setPlacing(true)
    try {
      const order = await placeGuestOrder({
        branch_id: branchId,
        table_id: tableId ?? null,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        lines: cart,
      })
      setOrderId(order.id)
      setStage('success')
      setCart([])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setPlacing(false)
    }
  }

  if (!branchId) return <Centered>No branch specified.</Centered>

  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-ink-500">Loading menu…</p>
      </div>
    </div>
  )

  if (err && !branch) return <Centered><span className="text-red-600">{err}</span></Centered>

  if (stage === 'success' && orderId) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="font-display text-2xl text-ink-900 mb-1">Order placed!</h1>
          {table && <p className="text-sm text-ink-500 mb-1">Table {table.table_number}</p>}
          <p className="text-sm text-ink-400 mb-6">Your order is on its way to the kitchen.</p>
          <img
            alt="Scan to track order"
            width={180} height={180}
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/restaurant/track/${orderId}`)}`}
            className="mx-auto mb-3 rounded-lg border border-ink-100"
          />
          <p className="text-xs text-ink-400 mb-5">Scan to track your order status</p>
          <Link
            to={`/restaurant/track/${orderId}`}
            className="block w-full py-3 rounded-xl bg-brand-600 text-white font-medium text-sm text-center hover:bg-brand-700 transition-colors"
          >
            Track order →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-ink-100 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-display text-lg text-ink-900 leading-tight">{branch?.name ?? 'Menu'}</div>
            {table
              ? <div className="text-xs text-ink-500">Table {table.table_number} · {table.area}</div>
              : <div className="text-xs text-ink-400">Scan to order</div>
            }
          </div>
          {stage === 'checkout' && (
            <button
              onClick={() => { setStage('menu'); setErr(null) }}
              className="text-sm text-brand-700 font-medium"
            >
              ← Back
            </button>
          )}
        </div>
      </header>

      {/* ── MENU ── */}
      {stage === 'menu' && (
        <>
          {/* Category tabs */}
          {categories.length > 0 && (
            <div className="bg-white border-b border-ink-100 sticky top-[57px] z-20 overflow-x-auto scrollbar-none">
              <div className="max-w-2xl mx-auto px-4 flex gap-2 py-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCat(c.id)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      activeCat === c.id
                        ? 'bg-brand-600 text-white'
                        : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Items list */}
          <div className="max-w-2xl mx-auto px-4 py-4 pb-32">
            {filteredItems.length === 0 ? (
              <p className="text-center text-ink-400 py-16">No items in this category.</p>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setConfiguring(item)}
                    className="w-full bg-white rounded-xl border border-ink-100 p-4 text-left hover:border-brand-300 hover:shadow-sm active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink-900">{item.name}</div>
                        {item.description && (
                          <div className="text-sm text-ink-500 mt-0.5 line-clamp-2">{item.description}</div>
                        )}
                        <div className="mt-2 font-display text-lg text-brand-700">{MYR(Number(item.price))}</div>
                      </div>
                      {item.image_url ? (
                        <div className="relative flex-shrink-0">
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-20 h-20 rounded-xl object-cover"
                          />
                          <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-md">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </div>
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center flex-shrink-0 mt-1">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Floating cart button */}
          {cartCount > 0 && (
            <div className="fixed bottom-6 inset-x-0 flex justify-center z-40 px-4">
              <button
                onClick={() => setStage('checkout')}
                className="bg-brand-600 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 max-w-sm w-full justify-between hover:bg-brand-700 active:scale-[0.98] transition-all"
              >
                <span className="bg-white/25 rounded-lg w-7 h-7 flex items-center justify-center text-sm font-bold">{cartCount}</span>
                <span className="font-medium">View order</span>
                <span className="font-display text-lg">{MYR(total)}</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* ── CHECKOUT ── */}
      {stage === 'checkout' && (
        <div className="max-w-2xl mx-auto px-4 py-6 pb-10">
          <h2 className="font-display text-xl text-ink-900 mb-4">Your order</h2>

          {/* Cart items */}
          <div className="bg-white rounded-xl border border-ink-100 mb-4 divide-y divide-ink-100">
            {cart.map((l) => {
              const linePrice = l.quantity * (Number(l.menuItem.price) + l.modifiers.reduce((m, x) => m + Number(x.price_delta), 0))
              return (
                <div key={l.tempKey} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink-900">{l.menuItem.name}</div>
                    {l.modifiers.length > 0 && (
                      <div className="text-xs text-ink-500 mt-0.5">{l.modifiers.map((m) => m.name).join(', ')}</div>
                    )}
                    {l.specialInstruction && (
                      <div className="text-xs text-amber-600 italic mt-0.5">{l.specialInstruction}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQty(l.tempKey, -1)}
                        className="w-7 h-7 rounded-lg border border-ink-200 flex items-center justify-center text-ink-600 hover:bg-ink-50"
                      >−</button>
                      <span className="w-6 text-center text-sm font-medium">{l.quantity}</span>
                      <button
                        onClick={() => updateQty(l.tempKey, 1)}
                        className="w-7 h-7 rounded-lg border border-ink-200 flex items-center justify-center text-ink-600 hover:bg-ink-50"
                      >+</button>
                    </div>
                    <div className="text-sm font-medium w-14 text-right">{MYR(linePrice)}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Totals */}
          <div className="bg-white rounded-xl border border-ink-100 p-4 mb-4 text-sm space-y-2">
            <div className="flex justify-between text-ink-600"><span>Subtotal</span><span>{MYR(subtotal)}</span></div>
            <div className="flex justify-between text-ink-500"><span>SST (6%)</span><span>{MYR(tax)}</span></div>
            <div className="flex justify-between font-display text-lg border-t border-ink-100 pt-2 mt-2">
              <span>Total</span><span>{MYR(total)}</span>
            </div>
          </div>

          {/* Customer details */}
          <div className="bg-white rounded-xl border border-ink-100 p-4 mb-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">
                Your name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Ahmad"
                className="w-full border border-ink-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">
                Phone <span className="text-ink-400 text-xs font-normal">(optional — for loyalty points)</span>
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+60 12-345 6789"
                className="w-full border border-ink-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
              />
            </div>
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">{err}</div>
          )}

          <button
            onClick={submit}
            disabled={placing || cart.length === 0}
            className="w-full py-4 rounded-2xl bg-brand-600 text-white font-medium text-base disabled:opacity-50 hover:bg-brand-700 active:scale-[0.99] transition-all"
          >
            {placing ? 'Placing order…' : `Place order · ${MYR(total)}`}
          </button>
        </div>
      )}

      {/* Item configure modal */}
      {configuring && (
        <ItemModal
          item={configuring}
          modifiers={modifiers.filter((m) => m.menu_item_id === configuring.id)}
          onClose={() => setConfiguring(null)}
          onAdd={(mods, note) => { addToCart(configuring, mods, note); setConfiguring(null) }}
        />
      )}
    </div>
  )
}

function ItemModal({
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
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const selectedMods = modifiers.filter((m) => selected.has(m.id))
  const priceDelta = selectedMods.reduce((s, m) => s + Number(m.price_delta), 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-ink-200 rounded-full mx-auto mt-3 mb-1" />
        {item.image_url && (
          <div className="px-5 pt-2 pb-0">
            <img
              src={item.image_url}
              alt={item.name}
              className="w-full h-48 object-cover rounded-2xl"
            />
          </div>
        )}
        <div className="p-5 pb-8">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 pr-3">
              <h3 className="font-display text-xl text-ink-900">{item.name}</h3>
              {item.description && (
                <p className="text-sm text-ink-500 mt-0.5">{item.description}</p>
              )}
            </div>
            <button onClick={onClose} className="text-2xl text-ink-400 leading-none flex-shrink-0">×</button>
          </div>

          {modifiers.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium text-ink-700 mb-2">Add-ons</div>
              <div className="space-y-0">
                {modifiers.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center justify-between gap-2 py-3 border-b border-ink-50 cursor-pointer"
                  >
                    <span className="flex items-center gap-3 text-sm text-ink-800">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggle(m.id)}
                        className="w-4 h-4 rounded accent-brand-600"
                      />
                      {m.name}
                    </span>
                    <span className="text-sm text-ink-500 flex-shrink-0">
                      {Number(m.price_delta) > 0 ? `+${MYR(Number(m.price_delta))}` : 'Free'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mb-5">
            <div className="text-sm font-medium text-ink-700 mb-1">Special request</div>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. no onions, extra sauce…"
              className="w-full border border-ink-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="font-display text-xl text-ink-900">{MYR(Number(item.price) + priceDelta)}</span>
            <button
              onClick={() => onAdd(selectedMods, note)}
              className="px-6 py-3 bg-brand-600 text-white rounded-xl font-medium text-sm hover:bg-brand-700 transition-colors"
            >
              Add to order
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8 text-center text-ink-500">
      {children}
    </div>
  )
}
