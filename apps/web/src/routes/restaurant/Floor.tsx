import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Select, Spinner } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listTables, updateTableStatus, listReservations, createReservation, updateReservation,
  listWaitlist, addToWaitlist, updateWaitlist,
} from '../../lib/restaurant/store'
import type {
  RestaurantTable, Reservation, WaitlistEntry, TableStatus,
} from '../../lib/restaurant/types'
import { shortTime, minutesAgo } from '../../lib/restaurant/format'

export default function Floor() {
  const { branchId } = useRestaurant()
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [resList, setRes] = useState<Reservation[]>([])
  const [wait, setWait] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'floor' | 'reservations' | 'waitlist'>('floor')
  const [selected, setSelected] = useState<RestaurantTable | null>(null)

  const refresh = async () => {
    if (!branchId) return
    setLoading(true); setError(null)
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const [t, r, w] = await Promise.all([
        listTables(branchId), listReservations(branchId, today.toISOString()), listWaitlist(branchId),
      ])
      setTables(t); setRes(r); setWait(w)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [branchId])
  useEffect(() => {
    if (!branchId) return
    const id = setInterval(() => { void refresh() }, 15000)
    return () => clearInterval(id)
  }, [branchId])

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading && tables.length === 0) return <div className="py-10 text-center"><Spinner /> Loading floor…</div>

  return (
    <div className="space-y-4">
      {error && <Alert tone="red">{error}</Alert>}
      <div className="flex gap-1">
        {(['floor', 'reservations', 'waitlist'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${
              tab === t ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
            }`}
          >
            {t}
            {t === 'waitlist' && wait.length > 0 && <span className="ml-1">· {wait.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'floor' && <FloorTab tables={tables} onClick={setSelected} onChanged={refresh} />}
      {tab === 'reservations' && <ReservationsTab reservations={resList} tables={tables} onChanged={refresh} />}
      {tab === 'waitlist' && <WaitlistTab waitlist={wait} onChanged={refresh} />}

      {selected && (
        <TableDetailModal
          table={selected}
          allTables={tables}
          onClose={() => setSelected(null)}
          onChanged={async () => { await refresh(); setSelected(null) }}
        />
      )}
    </div>
  )
}

function FloorTab({ tables, onClick, onChanged }: { tables: RestaurantTable[]; onClick: (t: RestaurantTable) => void; onChanged: () => Promise<void> }) {
  const areas = Array.from(new Set(tables.map((t) => t.area ?? 'indoor')))
  const [editMode, setEditMode] = useState(false)
  const counts = {
    free: tables.filter((t) => t.status === 'free').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    reserved: tables.filter((t) => t.status === 'reserved').length,
    cleaning: tables.filter((t) => t.status === 'cleaning').length,
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-400 rounded" />Free {counts.free}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded" />Occupied {counts.occupied}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-400 rounded" />Reserved {counts.reserved}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-400 rounded" />Cleaning {counts.cleaning}</span>
        </div>
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className={`btn-sm ${editMode ? 'btn-brand' : 'btn-secondary'}`}
        >
          {editMode ? 'Done editing' : 'Edit floor plan'}
        </button>
      </div>
      {areas.map((area) => (
        <Card key={area}>
          <CardBody>
            <h3 className="font-display capitalize mb-3">{area}</h3>
            {editMode ? (
              <FloorAreaEditor
                tables={tables.filter((t) => (t.area ?? 'indoor') === area)}
                onChanged={onChanged}
              />
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                {tables.filter((t) => (t.area ?? 'indoor') === area).map((t) => (
                  <button key={t.id}
                    onClick={() => onClick(t)}
                    className={`aspect-square border-2 rounded-xl flex flex-col items-center justify-center text-sm font-semibold hover:scale-105 transition-transform ${
                      t.status === 'free' ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                      : t.status === 'occupied' ? 'border-red-400 bg-red-50 text-red-900'
                      : t.status === 'reserved' ? 'border-amber-400 bg-amber-50 text-amber-900'
                      : t.status === 'cleaning' ? 'border-yellow-400 bg-yellow-50 text-yellow-900'
                      : 'border-ink-300 bg-ink-100 text-ink-500'
                    }`}
                    title={t.status}
                  >
                    <span>{t.table_number}</span>
                    <span className="text-[10px] opacity-70">{t.capacity}p · {t.shape}</span>
                    {t.last_status_change && <span className="text-[10px] opacity-70">{minutesAgo(t.last_status_change)}m</span>}
                  </button>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

/**
 * Drag-drop editor: tables snap to a 12-column grid via pos_x (0–11) +
 * pos_y (rows). On drop we persist new pos_x/pos_y to the row.
 */
function FloorAreaEditor({ tables, onChanged }: { tables: RestaurantTable[]; onChanged: () => Promise<void> }) {
  const COLS = 12
  const ROWS = Math.max(6, Math.ceil(tables.length / 2))
  const cell = (x: number, y: number) => tables.find((t) => (t.pos_x ?? -1) === x && (t.pos_y ?? -1) === y)
  const unplaced = tables.filter((t) => (t.pos_x ?? null) === null || (t.pos_y ?? null) === null
    || (t.pos_x ?? 0) >= COLS || (t.pos_y ?? 0) >= ROWS)
  const onDragStart = (e: React.DragEvent, id: string) => { e.dataTransfer.setData('text/plain', id) }
  const onDrop = async (e: React.DragEvent, x: number, y: number) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    if (cell(x, y)) return
    const { updateTable } = await import('../../lib/restaurant/store')
    await updateTable(id, { pos_x: x, pos_y: y })
    await onChanged()
  }
  return (
    <div>
      <p className="text-xs text-ink-500 mb-2">Drag tables onto the grid to position them. Pos saved to the database.</p>
      <div className="grid border border-ink-200 rounded-lg p-1 gap-1 bg-ink-50/50" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
        {Array.from({ length: COLS * ROWS }).map((_, i) => {
          const x = i % COLS, y = Math.floor(i / COLS)
          const t = cell(x, y)
          return (
            <div key={i} className="aspect-square rounded-md border border-dashed border-ink-200/60"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => void onDrop(e, x, y)}>
              {t && (
                <div draggable onDragStart={(e) => onDragStart(e, t.id)}
                  className="w-full h-full rounded-md bg-white border border-ink-300 flex flex-col items-center justify-center text-xs cursor-grab">
                  <span className="font-semibold">{t.table_number}</span>
                  <span className="text-[10px] text-ink-500">{t.capacity}p</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {unplaced.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-ink-500 mb-1">Unplaced tables (drag onto grid):</div>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((t) => (
              <div key={t.id} draggable onDragStart={(e) => onDragStart(e, t.id)}
                className="px-3 py-1.5 rounded-md bg-white border border-ink-300 text-xs cursor-grab">
                {t.table_number} ({t.capacity}p)
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TableDetailModal({ table, allTables, onClose, onChanged }: { table: RestaurantTable; allTables: RestaurantTable[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const setStatus = async (s: TableStatus) => { await updateTableStatus(table.id, s); await onChanged() }
  const transferTo = async () => {
    const others = allTables.filter((t) => t.id !== table.id && t.status === 'free')
    if (others.length === 0) { window.alert('No free tables'); return }
    const opts = others.map((t) => `${t.table_number} (${t.capacity}p ${t.area})`).join(', ')
    const pick = window.prompt(`Transfer active order to which table number?\nFree: ${opts}`)
    if (!pick) return
    const dest = others.find((t) => t.table_number.toLowerCase() === pick.trim().toLowerCase())
    if (!dest) { window.alert('Not found'); return }
    const { transferActiveOrder } = await import('../../lib/restaurant/store')
    await transferActiveOrder(table.id, dest.id)
    await onChanged()
    onClose()
  }
  const merge = async () => {
    const others = allTables.filter((t) => t.id !== table.id)
    const opts = others.map((t) => `${t.table_number}`).join(', ')
    const pick = window.prompt(`Merge with which table? Active orders are combined onto this one.\nAvailable: ${opts}`)
    if (!pick) return
    const dest = others.find((t) => t.table_number.toLowerCase() === pick.trim().toLowerCase())
    if (!dest) { window.alert('Not found'); return }
    const { mergeTables } = await import('../../lib/restaurant/store')
    await mergeTables(dest.id, table.id) // dest receives orders, source becomes free
    await onChanged()
    onClose()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Table ${table.table_number}`}>
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 relative z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-xl">Table {table.table_number}</h3>
          <Badge tone={
            table.status === 'free' ? 'green' : table.status === 'occupied' ? 'red' : table.status === 'reserved' ? 'amber' : 'gray'
          }>{table.status}</Badge>
        </div>
        <div className="text-sm text-ink-500 mb-4">
          Capacity {table.capacity} · {table.shape} · {table.area}
          {table.last_status_change && <> · changed {minutesAgo(table.last_status_change)}m ago</>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setStatus('free')}>Free</Button>
          <Button variant="secondary" onClick={() => setStatus('occupied')}>Seat / Occupy</Button>
          <Button variant="secondary" onClick={() => setStatus('reserved')}>Reserve</Button>
          <Button variant="secondary" onClick={() => setStatus('cleaning')}>Cleaning</Button>
          <Button variant="ghost" onClick={() => setStatus('out_of_service')}>Out of service</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        {table.status === 'occupied' && (
          <div className="mt-3 pt-3 border-t border-ink-100 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={transferTo}>Transfer order →</Button>
            <Button variant="secondary" onClick={merge}>Merge ↣</Button>
          </div>
        )}
      </div>
    </div>
  )
}

function ReservationsTab({ reservations, tables, onChanged }: { reservations: Reservation[]; tables: RestaurantTable[]; onChanged: () => Promise<void> }) {
  const { branchId } = useRestaurant()
  const [form, setForm] = useState({ customer_name: '', phone: '', party_size: 2, reservation_time: '', table_id: '' })
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!branchId) return
    if (!form.customer_name || !form.reservation_time) { setErr('Name and time required'); return }
    try {
      await createReservation({
        branch_id: branchId,
        customer_name: form.customer_name,
        phone: form.phone || null,
        party_size: form.party_size,
        reservation_time: new Date(form.reservation_time).toISOString(),
        table_id: form.table_id || null,
      })
      await onChanged()
      setForm({ customer_name: '', phone: '', party_size: 2, reservation_time: '', table_id: '' })
      setErr(null)
    } catch (e) { setErr((e as Error).message) }
  }

  const suggest = (partySize: number) => tables.filter((t) => t.capacity >= partySize).sort((a, b) => a.capacity - b.capacity)[0]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardBody>
          <h3 className="font-display text-lg mb-3">New reservation</h3>
          <Input label="Customer name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Party size" type="number" min={1} value={String(form.party_size)} onChange={(e) => setForm({ ...form, party_size: parseInt(e.target.value) || 1 })} />
          <Input label="Reservation time" type="datetime-local" value={form.reservation_time} onChange={(e) => setForm({ ...form, reservation_time: e.target.value })} />
          <Select label="Table (optional; auto-suggest below)" value={form.table_id} onChange={(e) => setForm({ ...form, table_id: e.target.value })}>
            <option value="">— auto-assign at seat time —</option>
            {tables.map((t) => <option key={t.id} value={t.id}>{t.table_number} · {t.capacity}p · {t.area}</option>)}
          </Select>
          {form.party_size > 0 && suggest(form.party_size) && (
            <div className="text-xs text-ink-500 -mt-2 mb-2">Suggested: {suggest(form.party_size).table_number} ({suggest(form.party_size).capacity}p)</div>
          )}
          {err && <Alert tone="red">{err}</Alert>}
          <Button onClick={submit}>Save reservation</Button>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <h3 className="font-display text-lg mb-3">Upcoming</h3>
          {reservations.length === 0 ? (
            <div className="text-sm text-ink-500">No reservations today.</div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {reservations.map((r) => {
                const tbl = tables.find((t) => t.id === r.table_id)
                return (
                  <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{r.customer_name} · {r.party_size}p</div>
                      <div className="text-xs text-ink-500">
                        {new Date(r.reservation_time).toLocaleString()}
                        {tbl && <> · Table {tbl.table_number}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={r.status === 'confirmed' ? 'brand' : r.status === 'seated' ? 'green' : 'gray'}>{r.status}</Badge>
                      {r.status === 'confirmed' && (
                        <button className="text-xs btn-ghost btn-sm"
                          onClick={async () => { await updateReservation(r.id, { status: 'seated' }); if (r.table_id) await updateTableStatus(r.table_id, 'occupied'); await onChanged() }}>
                          Seat
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function WaitlistTab({ waitlist, onChanged }: { waitlist: WaitlistEntry[]; onChanged: () => Promise<void> }) {
  const { branchId } = useRestaurant()
  const [form, setForm] = useState({ customer_name: '', phone: '', party_size: 2, estimated_wait_minutes: 20 })
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!branchId) return
    if (!form.customer_name) { setErr('Name required'); return }
    try {
      await addToWaitlist({
        branch_id: branchId,
        customer_name: form.customer_name,
        phone: form.phone || null,
        party_size: form.party_size,
        estimated_wait_minutes: form.estimated_wait_minutes,
      })
      await onChanged()
      setForm({ customer_name: '', phone: '', party_size: 2, estimated_wait_minutes: 20 })
      setErr(null)
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardBody>
          <h3 className="font-display text-lg mb-3">Add walk-in</h3>
          <Input label="Customer name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Party size" type="number" min={1} value={String(form.party_size)} onChange={(e) => setForm({ ...form, party_size: parseInt(e.target.value) || 1 })} />
          <Input label="Est. wait (min)" type="number" min={0} value={String(form.estimated_wait_minutes)} onChange={(e) => setForm({ ...form, estimated_wait_minutes: parseInt(e.target.value) || 0 })} />
          {err && <Alert tone="red">{err}</Alert>}
          <Button onClick={submit}>Add to waitlist</Button>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <h3 className="font-display text-lg mb-3">Waiting ({waitlist.length})</h3>
          {waitlist.length === 0 ? (
            <div className="text-sm text-ink-500">No one on the waitlist.</div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {waitlist.map((w) => (
                <li key={w.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{w.customer_name} · {w.party_size}p</div>
                    <div className="text-xs text-ink-500">
                      waiting {minutesAgo(w.requested_at)}m / estimate {w.estimated_wait_minutes ?? 0}m · {shortTime(w.requested_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={w.status === 'notified' ? 'amber' : 'gray'}>{w.status}</Badge>
                    {w.status === 'waiting' && (
                      <button className="btn-ghost btn-sm"
                        onClick={async () => { await updateWaitlist(w.id, { status: 'notified' }); await onChanged() }}>
                        Notify
                      </button>
                    )}
                    <button className="btn-ghost btn-sm"
                      onClick={async () => { await updateWaitlist(w.id, { status: 'seated', seated_at: new Date().toISOString() }); await onChanged() }}>
                      Seat
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
