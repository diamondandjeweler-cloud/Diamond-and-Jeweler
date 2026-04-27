import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Select, Spinner } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listSuppliers, createSupplier, listIngredients, listPurchaseOrders, listPOLines,
  createPO, receivePO,
} from '../../lib/restaurant/store'
import type { Ingredient, PurchaseOrder, PurchaseOrderLine, Supplier } from '../../lib/restaurant/types'
import { MYR, shortDate } from '../../lib/restaurant/format'
import { getSelfBilledByPO, triggerSelfBilled, updateSupplierEinvoice } from '../../lib/restaurant/einvoice'

export default function Purchasing() {
  const { branchId } = useRestaurant()
  const [tab, setTab] = useState<'po' | 'suppliers'>('po')
  const [pos, setPOs] = useState<PurchaseOrder[]>([])
  const [sups, setSups] = useState<Supplier[]>([])
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const refresh = async () => {
    if (!branchId) return
    setLoading(true); setErr(null)
    try {
      const [p, s, i] = await Promise.all([listPurchaseOrders(branchId), listSuppliers(branchId), listIngredients(branchId)])
      setPOs(p); setSups(s); setIngs(i)
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [branchId])

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading && pos.length === 0) return <div className="py-10 text-center"><Spinner /> Loading…</div>

  return (
    <div className="space-y-4">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="flex gap-1">
        {(['po', 'suppliers'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === t ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}>
            {t === 'po' ? 'Purchase orders' : 'Suppliers'}
          </button>
        ))}
      </div>

      {tab === 'po' && <POTab pos={pos} suppliers={sups} ingredients={ings} branchId={branchId} onChanged={refresh} />}
      {tab === 'suppliers' && <SuppliersTab suppliers={sups} branchId={branchId} onChanged={refresh} />}
    </div>
  )
}

function POTab({ pos, suppliers, ingredients, branchId, onChanged }: { pos: PurchaseOrder[]; suppliers: Supplier[]; ingredients: Ingredient[]; branchId: string; onChanged: () => Promise<void> }) {
  const [creating, setCreating] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-lg">Purchase orders ({pos.length})</h2>
        <Button onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ Create PO'}</Button>
      </div>
      {creating && <NewPO suppliers={suppliers} ingredients={ingredients} branchId={branchId} onDone={async () => { setCreating(false); await onChanged() }} />}

      {pos.length === 0 ? (
        <EmptyState title="No purchase orders yet" />
      ) : (
        <div className="space-y-2">
          {pos.map((p) => <POCard key={p.id} po={p} supplier={suppliers.find((s) => s.id === p.supplier_id) ?? null} ingredients={ingredients} branchId={branchId} onChanged={onChanged} />)}
        </div>
      )}
    </div>
  )
}

function NewPO({ suppliers, ingredients, branchId, onDone }: { suppliers: Supplier[]; ingredients: Ingredient[]; branchId: string; onDone: () => Promise<void> }) {
  const [supplierId, setSupplierId] = useState('')
  const [expected, setExpected] = useState('')
  const [lines, setLines] = useState<Array<{ ingredient_id: string; ordered_qty: number; unit_cost: number }>>([])
  const [err, setErr] = useState<string | null>(null)

  const total = lines.reduce((s, l) => s + l.ordered_qty * l.unit_cost, 0)

  const addLine = () => {
    const low = ingredients.filter((i) => Number(i.reorder_level) > 0 && Number(i.current_stock) < Number(i.reorder_level))
    const first = low[0] ?? ingredients[0]
    if (!first) return
    setLines([...lines, { ingredient_id: first.id, ordered_qty: Math.max(1, Number(first.reorder_level ?? 0) * 2 - Number(first.current_stock)), unit_cost: Number(first.cost_per_unit) }])
  }
  const autoFillLow = () => {
    const low = ingredients.filter((i) => Number(i.reorder_level) > 0 && Number(i.current_stock) < Number(i.reorder_level))
    setLines(low.map((i) => ({
      ingredient_id: i.id,
      ordered_qty: Math.max(1, Number(i.reorder_level ?? 0) * 2 - Number(i.current_stock)),
      unit_cost: Number(i.cost_per_unit),
    })))
  }

  const save = async () => {
    if (lines.length === 0) { setErr('Add at least one line'); return }
    try {
      await createPO(branchId, supplierId || null, expected || null, lines)
      await onDone()
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— none —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Expected date" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={autoFillLow}>Autofill low stock</Button>
            <Button variant="ghost" onClick={addLine}>+ Line</Button>
          </div>
        </div>

        {lines.length === 0 ? (
          <div className="text-sm text-ink-500">No lines yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500">
              <tr><th className="pb-2">Ingredient</th><th className="pb-2 text-right">Qty</th><th className="pb-2 text-right">Unit cost</th><th className="pb-2 text-right">Line total</th><th /></tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const ing = ingredients.find((i) => i.id === l.ingredient_id)
                return (
                  <tr key={idx} className="border-t border-ink-100">
                    <td className="py-2">
                      <select value={l.ingredient_id} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, ingredient_id: e.target.value } : x))} className="text-sm">
                        {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </td>
                    <td className="py-2 text-right">
                      <input type="number" step="0.001" className="w-24 text-right text-sm" value={l.ordered_qty} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, ordered_qty: parseFloat(e.target.value) || 0 } : x))} />
                      <span className="ml-1 text-ink-500">{ing?.unit}</span>
                    </td>
                    <td className="py-2 text-right">
                      <input type="number" step="0.0001" className="w-24 text-right text-sm" value={l.unit_cost} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, unit_cost: parseFloat(e.target.value) || 0 } : x))} />
                    </td>
                    <td className="py-2 text-right">{MYR(l.ordered_qty * l.unit_cost)}</td>
                    <td className="py-2 text-right"><button className="text-red-500 text-xs" onClick={() => setLines(lines.filter((_, i) => i !== idx))}>remove</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="flex justify-between items-center">
          <span className="font-medium">Total: {MYR(total)}</span>
          {err && <Alert tone="red">{err}</Alert>}
          <Button onClick={save}>Save PO</Button>
        </div>
      </CardBody>
    </Card>
  )
}

function POCard({ po, supplier, ingredients, branchId, onChanged }: { po: PurchaseOrder; supplier: Supplier | null; ingredients: Ingredient[]; branchId: string; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [poLines, setPOLines] = useState<PurchaseOrderLine[]>([])
  const [received, setReceived] = useState<Record<string, { qty: string; cost: string }>>({})

  useEffect(() => { if (open && poLines.length === 0) void listPOLines(po.id).then(setPOLines) }, [open, po.id])

  const doReceive = async () => {
    const lines = poLines.map((l) => ({
      id: l.id,
      received_qty: parseFloat(received[l.id]?.qty ?? String(l.ordered_qty)) || 0,
      unit_cost: parseFloat(received[l.id]?.cost ?? String(l.unit_cost)) || Number(l.unit_cost),
    })).filter((l) => l.received_qty > 0)
    if (lines.length === 0) return
    await receivePO(po.id, lines, branchId)
    setPOLines([])
    setOpen(false)
    await onChanged()
  }

  return (
    <Card>
      <CardBody>
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between">
          <div>
            <div className="font-display">{supplier?.name ?? '—'} <span className="text-xs text-ink-500 ml-2">#{po.id.slice(0,6)}</span></div>
            <div className="text-xs text-ink-500">Expected {shortDate(po.expected_date ?? undefined)} · {MYR(Number(po.total_cost))}</div>
          </div>
          <Badge tone={po.status === 'received' ? 'green' : po.status === 'cancelled' ? 'red' : 'amber'}>{po.status}</Badge>
        </button>
        {open && (
          <div className="mt-3 pt-3 border-t">
            <SelfBilledStatus poId={po.id} />
            {poLines.length === 0 ? <div className="text-sm text-ink-500">Loading lines…</div> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-500">
                  <tr><th className="pb-2">Ingredient</th><th className="pb-2 text-right">Ordered</th><th className="pb-2 text-right">Receive qty</th><th className="pb-2 text-right">Unit cost</th></tr>
                </thead>
                <tbody>
                  {poLines.map((l) => {
                    const ing = ingredients.find((i) => i.id === l.ingredient_id)
                    return (
                      <tr key={l.id} className="border-t border-ink-100">
                        <td className="py-2">{ing?.name}</td>
                        <td className="py-2 text-right">{Number(l.ordered_qty).toFixed(2)}</td>
                        <td className="py-2 text-right">
                          <input type="number" step="0.001" className="w-24 text-right text-sm" defaultValue={String(l.received_qty ?? l.ordered_qty)}
                            onChange={(e) => setReceived({ ...received, [l.id]: { ...received[l.id], qty: e.target.value, cost: received[l.id]?.cost ?? String(l.unit_cost) } })} />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" step="0.0001" className="w-24 text-right text-sm" defaultValue={String(l.unit_cost)}
                            onChange={(e) => setReceived({ ...received, [l.id]: { ...received[l.id], cost: e.target.value, qty: received[l.id]?.qty ?? String(l.ordered_qty) } })} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {po.status !== 'received' && <div className="mt-3 flex justify-end"><Button onClick={doReceive}>Mark received & update stock</Button></div>}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function SelfBilledStatus({ poId }: { poId: string }) {
  const [sbi, setSbi] = useState<Awaited<ReturnType<typeof getSelfBilledByPO>>>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg]   = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try { const x = await getSelfBilledByPO(poId); if (alive) setSbi(x) } catch { /* swallow */ }
    }
    void tick()
    const id = setInterval(() => { void tick() }, 4000)
    return () => { alive = false; clearInterval(id) }
  }, [poId])

  if (!sbi) return null

  const tone = sbi.status === 'validated' || sbi.status === 'shared' ? 'green'
             : sbi.status === 'failed' || sbi.status === 'escalated' ? 'red'
             : 'amber'

  const submit = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await triggerSelfBilled(poId)
      setMsg(r.ok ? `Submitted ${r.submitted}, failed ${r.failed}` : 'Failed')
    } catch (e) { setMsg((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="mb-3 px-3 py-2 rounded-md border border-ink-200 bg-ink-50 flex items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-2">
        <Badge tone={tone}>self-billed: {sbi.status}</Badge>
        {sbi.shared_with_supplier_at && <span className="text-xs text-ink-500">shared {shortDate(sbi.shared_with_supplier_at)}</span>}
        <span className="text-xs text-ink-400 font-mono">{sbi.supplier_tin ?? ''}</span>
      </div>
      <div className="flex items-center gap-2">
        {(sbi.status === 'pending' || sbi.status === 'failed' || sbi.status === 'submitted') && (
          <Button size="sm" variant="ghost" onClick={submit} loading={busy}>
            {sbi.status === 'failed' ? 'Retry submission' : 'Submit now'}
          </Button>
        )}
        {msg && <span className="text-xs text-ink-500">{msg}</span>}
      </div>
    </div>
  )
}

function SuppliersTab({ suppliers, branchId, onChanged }: { suppliers: Supplier[]; branchId: string; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', contact_name: '', phone: '', email: '', lead_time_days: 3 })
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (!form.name) { setErr('Name required'); return }
    try { await createSupplier({ ...form, branch_id: branchId }); setForm({ name: '', contact_name: '', phone: '', email: '', lead_time_days: 3 }); setErr(null); await onChanged() }
    catch (e) { setErr((e as Error).message) }
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card><CardBody>
        <h3 className="font-display text-lg mb-3">New supplier</h3>
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Contact" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
        <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Lead time (days)" type="number" value={String(form.lead_time_days)} onChange={(e) => setForm({ ...form, lead_time_days: parseInt(e.target.value) || 0 })} />
        {err && <Alert tone="red">{err}</Alert>}
        <Button onClick={save}>Save</Button>
      </CardBody></Card>
      <Card className="md:col-span-2"><CardBody>
        <h3 className="font-display text-lg mb-3">Suppliers</h3>
        {suppliers.length === 0 ? <div className="text-sm text-ink-500">None yet.</div> : (
          <ul className="divide-y divide-ink-100">
            {suppliers.map((s) => <SupplierRow key={s.id} supplier={s} onChanged={onChanged} />)}
          </ul>
        )}
      </CardBody></Card>
    </div>
  )
}

interface SupplierEinvoice {
  tin: string | null
  is_foreign: boolean
  foreign_tax_id: string | null
  country_code: string
  einvoice_email: string | null
  auto_self_billed: boolean
  self_billed_trigger: 'po_creation' | 'goods_receipt'
  address: string | null
}

function SupplierRow({ supplier, onChanged }: { supplier: Supplier & Partial<SupplierEinvoice>; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)
  const [form, setForm] = useState<SupplierEinvoice>({
    tin:                supplier.tin ?? null,
    is_foreign:         supplier.is_foreign ?? false,
    foreign_tax_id:     supplier.foreign_tax_id ?? null,
    country_code:       supplier.country_code ?? 'MY',
    einvoice_email:     supplier.einvoice_email ?? null,
    auto_self_billed:   supplier.auto_self_billed ?? false,
    self_billed_trigger: supplier.self_billed_trigger ?? 'goods_receipt',
    address:            supplier.address ?? null,
  })

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await updateSupplierEinvoice(supplier.id, form)
      await onChanged()
      setOpen(false)
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <li className="py-2">
      <button onClick={() => setOpen(!open)} className="w-full text-left flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{supplier.name} <span className="text-xs text-ink-400 font-mono">{form.tin ?? ''}</span></div>
          <div className="text-xs text-ink-500">{supplier.contact_name ?? '—'} · {supplier.email ?? '—'} · {supplier.lead_time_days ?? '—'}d</div>
        </div>
        <div className="flex items-center gap-2">
          {form.is_foreign && <Badge tone="amber">foreign</Badge>}
          {form.auto_self_billed && <Badge tone="brand">self-billed</Badge>}
          <span className="text-xs text-ink-400">{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open && (
        <div className="mt-2 p-3 border border-ink-200 rounded-md bg-ink-50 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Input label="TIN" value={form.tin ?? ''} onChange={(e) => setForm({ ...form, tin: e.target.value || null })} />
            <Select label="Foreign supplier" value={form.is_foreign ? '1' : '0'} onChange={(e) => setForm({ ...form, is_foreign: e.target.value === '1' })}>
              <option value="0">No (Malaysian)</option>
              <option value="1">Yes (foreign)</option>
            </Select>
            <Input label="Foreign tax id" value={form.foreign_tax_id ?? ''} onChange={(e) => setForm({ ...form, foreign_tax_id: e.target.value || null })} />
            <Input label="Country code" value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value })} />
            <Input label="E-invoice email" type="email" value={form.einvoice_email ?? ''} onChange={(e) => setForm({ ...form, einvoice_email: e.target.value || null })} placeholder="vendor@example.com" />
            <Input label="Address" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value || null })} />
            <Select label="Auto self-billed" value={form.auto_self_billed ? '1' : '0'} onChange={(e) => setForm({ ...form, auto_self_billed: e.target.value === '1' })}>
              <option value="0">Off</option>
              <option value="1">On — auto-issue self-billed e-invoice</option>
            </Select>
            <Select label="Trigger event" value={form.self_billed_trigger} onChange={(e) => setForm({ ...form, self_billed_trigger: e.target.value as 'po_creation' | 'goods_receipt' })}>
              <option value="po_creation">On PO creation</option>
              <option value="goods_receipt">On goods receipt</option>
            </Select>
          </div>
          {err && <Alert tone="red">{err}</Alert>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={busy}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </div>
      )}
    </li>
  )
}
