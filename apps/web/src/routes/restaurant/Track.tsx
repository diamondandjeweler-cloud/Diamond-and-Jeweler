import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface PublicOrder {
  id: string
  status: string
  order_type: string
  total: number
  created_at: string
  closed_at: string | null
}
interface PublicLine {
  id: string
  quantity: number
  status: string
  course_type: string | null
  menu_item: { name: string } | null
}

/**
 * Public customer order tracker. Polls every 5s to show item-level progress.
 * Reads via PostgREST `restaurant` schema (anon role with RLS allowing reads
 * by id). No auth required.
 */
export default function Track() {
  const { orderId } = useParams<{ orderId: string }>()
  const [order, setOrder] = useState<PublicOrder | null>(null)
  const [lines, setLines] = useState<PublicLine[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    const refresh = async () => {
      try {
        const db = supabase.schema('restaurant' as never) as unknown as ReturnType<typeof supabase.schema>
        const [o, li] = await Promise.all([
          db.from('orders').select('id, status, order_type, total, created_at, closed_at').eq('id', orderId).maybeSingle(),
          db.from('order_item').select('id, quantity, status, course_type, menu_item:menu_item_id(name)').eq('order_id', orderId),
        ])
        if (cancelled) return
        if (o.error) throw o.error
        setOrder(o.data as PublicOrder | null)
        setLines((li.data ?? []) as unknown as PublicLine[])
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      }
    }
    void refresh()
    const id = setInterval(refresh, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [orderId])

  if (!orderId) return <div className="p-8 text-center">No order ID.</div>

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="bg-white border-b border-ink-200 py-4 px-6">
        <h1 className="font-display text-xl text-ink-900">Order tracker</h1>
        <p className="text-xs text-ink-500">#{orderId.slice(0, 8)} · auto-refreshing</p>
      </header>
      <main className="max-w-md mx-auto px-4 py-8">
        {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 p-3 text-sm mb-4">{err}</div>}
        {!order ? (
          <div className="text-center text-ink-500">Loading…</div>
        ) : (
          <>
            <div className="card-elevated p-5 mb-4">
              <div className="text-xs text-ink-500 uppercase tracking-wide mb-1">{order.order_type}</div>
              <div className="font-display text-2xl text-ink-900 mb-1 capitalize">{order.status.replace(/_/g, ' ')}</div>
              <div className="text-sm text-ink-500">Placed {new Date(order.created_at).toLocaleString()}</div>
              {order.closed_at && <div className="text-sm text-emerald-700">Closed {new Date(order.closed_at).toLocaleString()}</div>}
            </div>

            <h2 className="font-display text-lg mb-2">Items</h2>
            <ul className="card divide-y divide-ink-100">
              {lines.map((l) => {
                const tone = l.status === 'served' ? 'bg-emerald-50 text-emerald-700'
                  : l.status === 'ready' ? 'bg-emerald-100 text-emerald-800'
                  : l.status === 'preparing' || l.status === 'fired' ? 'bg-amber-50 text-amber-700'
                  : l.status === 'voided' ? 'bg-red-50 text-red-700 line-through'
                  : 'bg-ink-100 text-ink-700'
                const friendly = l.status === 'pending' ? 'Queued'
                  : l.status === 'fired' ? 'Sent to kitchen'
                  : l.status === 'preparing' ? 'Chef is cooking'
                  : l.status === 'ready' ? 'Ready — coming out'
                  : l.status === 'served' ? 'Served'
                  : l.status === 'held' ? 'Held (course pacing)'
                  : l.status === 'voided' ? 'Voided'
                  : l.status === 'rejected' ? 'Out of stock'
                  : l.status
                return (
                  <li key={l.id} className="p-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{l.quantity}× {l.menu_item?.name ?? 'Item'}</div>
                      {l.course_type && l.course_type !== 'any' && <div className="text-xs text-ink-500 capitalize">{l.course_type}</div>}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${tone}`}>{friendly}</span>
                  </li>
                )
              })}
            </ul>
            <div className="text-xs text-ink-400 text-center mt-4">Refreshes every 5s</div>
          </>
        )}
      </main>
    </div>
  )
}
