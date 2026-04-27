import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Select, Spinner } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listIngredients, createIngredient, adjustStock,
  listInventoryTxns, logWaste, listWaste,
} from '../../lib/restaurant/store'
import type { Ingredient, InventoryTransaction, WasteLog, WasteReason } from '../../lib/restaurant/types'
import { MYR, shortDate } from '../../lib/restaurant/format'

export default function Inventory() {
  const { branchId, employee } = useRestaurant()
  const [tab, setTab] = useState<'stock' | 'txns' | 'waste' | 'stocktake'>('stock')
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [txns, setTxns] = useState<InventoryTransaction[]>([])
  const [waste, setWaste] = useState<WasteLog[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const refresh = async () => {
    if (!branchId) return
    setLoading(true); setErr(null)
    try {
      const [i, t, w] = await Promise.all([listIngredients(branchId), listInventoryTxns(branchId, 200), listWaste(branchId, 100)])
      setIngs(i); setTxns(t); setWaste(w)
    } catch (e) { setErr((e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [branchId])

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading && ings.length === 0) return <div className="py-10 text-center"><Spinner /> Loading…</div>

  return (
    <div className="space-y-4">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="flex gap-1">
        {(['stock','txns','waste','stocktake'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${tab === t ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}>
            {t === 'stocktake' ? 'Stock take' : t === 'txns' ? 'Transactions' : t}
          </button>
        ))}
      </div>

      {tab === 'stock' && <StockTab ingredients={ings} branchId={branchId} employeeId={employee?.id ?? null} onChanged={refresh} />}
      {tab === 'txns' && <TxnsTab txns={txns} ingredients={ings} />}
      {tab === 'waste' && <WasteTab waste={waste} ingredients={ings} branchId={branchId} employeeId={employee?.id ?? null} onChanged={refresh} />}
      {tab === 'stocktake' && <StockTakeTab ingredients={ings} branchId={branchId} employeeId={employee?.id ?? null} onChanged={refresh} />}
    </div>
  )
}

function StockTab({ ingredients, branchId, employeeId, onChanged }: { ingredients: Ingredient[]; branchId: string; employeeId: string | null; onChanged: () => Promise<void> }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', unit: 'g', current_stock: 0, reorder_level: 0, cost_per_unit: 0 })
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!form.name) { setErr('Name required'); return }
    try {
      await createIngredient({ ...form, branch_id: branchId })
      await onChanged(); setCreating(false); setErr(null)
      setForm({ name: '', unit: 'g', current_stock: 0, reorder_level: 0, cost_per_unit: 0 })
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Ingredients ({ingredients.length})</h2>
        <Button onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ New ingredient'}</Button>
      </div>

      {creating && (
        <Card><CardBody>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <Input label="Stock" type="number" step="0.001" value={String(form.current_stock)} onChange={(e) => setForm({ ...form, current_stock: parseFloat(e.target.value) || 0 })} />
            <Input label="Reorder lvl" type="number" step="0.001" value={String(form.reorder_level)} onChange={(e) => setForm({ ...form, reorder_level: parseFloat(e.target.value) || 0 })} />
            <Input label="Cost/unit" type="number" step="0.0001" value={String(form.cost_per_unit)} onChange={(e) => setForm({ ...form, cost_per_unit: parseFloat(e.target.value) || 0 })} />
          </div>
          {err && <Alert tone="red">{err}</Alert>}
          <Button onClick={save}>Save</Button>
        </CardBody></Card>
      )}

      <Card><CardBody className="p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-500 bg-ink-50">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Unit</th>
              <th className="p-3 text-right">Stock</th>
              <th className="p-3 text-right">Reorder</th>
              <th className="p-3 text-right">Cost/unit</th>
              <th className="p-3 text-right">Value</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((i) => {
              const below = Number(i.reorder_level) > 0 && Number(i.current_stock) < Number(i.reorder_level)
              const val = Number(i.current_stock) * Number(i.cost_per_unit)
              return (
                <tr key={i.id} className="border-t border-ink-100">
                  <td className="p-3 font-medium">{i.name} {below && <Badge tone="red" className="ml-2">low</Badge>}</td>
                  <td className="p-3">{i.unit}</td>
                  <td className="p-3 text-right">{Number(i.current_stock).toFixed(2)}</td>
                  <td className="p-3 text-right">{Number(i.reorder_level ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right">{MYR(Number(i.cost_per_unit))}</td>
                  <td className="p-3 text-right">{MYR(val)}</td>
                  <td className="p-3 text-right space-x-1">
                    <button className="btn-ghost btn-sm"
                      onClick={async () => {
                        const delta = parseFloat(window.prompt('Adjust by (positive or negative):') || '0')
                        if (!Number.isFinite(delta) || delta === 0) return
                        const reason = window.prompt('Reason (optional)') ?? undefined
                        await adjustStock(i.id, delta, 'adjustment', { branch_id: branchId, reason, created_by: employeeId ?? undefined })
                        await onChanged()
                      }}>Adjust</button>
                    <button className="btn-ghost btn-sm"
                      onClick={async () => {
                        const v = window.prompt('Receive how much?', '0')
                        const qty = parseFloat(v || '0'); if (qty <= 0) return
                        await adjustStock(i.id, qty, 'receive', { branch_id: branchId, unit_cost: Number(i.cost_per_unit), created_by: employeeId ?? undefined })
                        await onChanged()
                      }}>Receive</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardBody></Card>
    </div>
  )
}

function TxnsTab({ txns, ingredients }: { txns: InventoryTransaction[]; ingredients: Ingredient[] }) {
  return (
    <Card><CardBody className="p-0">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500 bg-ink-50">
          <tr>
            <th className="p-3">When</th>
            <th className="p-3">Ingredient</th>
            <th className="p-3">Type</th>
            <th className="p-3 text-right">Quantity</th>
            <th className="p-3 text-right">Unit cost</th>
            <th className="p-3">Reason</th>
          </tr>
        </thead>
        <tbody>
          {txns.length === 0 ? (
            <tr><td colSpan={6} className="p-6 text-center text-ink-500">No transactions yet.</td></tr>
          ) : txns.map((t) => {
            const ing = ingredients.find((i) => i.id === t.ingredient_id)
            return (
              <tr key={t.id} className="border-t border-ink-100">
                <td className="p-3">{new Date(t.created_at).toLocaleString()}</td>
                <td className="p-3">{ing?.name ?? '—'}</td>
                <td className="p-3"><Badge tone={t.type === 'waste' || t.type === 'transfer_out' ? 'red' : t.type === 'receive' || t.type === 'transfer_in' ? 'green' : 'gray'}>{t.type}</Badge></td>
                <td className={`p-3 text-right ${Number(t.quantity) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{Number(t.quantity) > 0 ? '+' : ''}{Number(t.quantity).toFixed(2)} {ing?.unit}</td>
                <td className="p-3 text-right">{t.unit_cost != null ? MYR(Number(t.unit_cost)) : '—'}</td>
                <td className="p-3 text-ink-500">{t.reason ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </CardBody></Card>
  )
}

function WasteTab({ waste, ingredients, branchId, employeeId, onChanged }: { waste: WasteLog[]; ingredients: Ingredient[]; branchId: string; employeeId: string | null; onChanged: () => Promise<void> }) {
  const [ingId, setIngId] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState<WasteReason>('expired')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    const q = parseFloat(qty); if (!ingId || !Number.isFinite(q) || q <= 0) { setErr('Pick ingredient and quantity'); return }
    const ing = ingredients.find((i) => i.id === ingId)!
    setBusy(true); setErr(null)
    try {
      await adjustStock(ingId, -q, 'waste', { branch_id: branchId, reason, unit_cost: Number(ing.cost_per_unit), created_by: employeeId ?? undefined })
      await logWaste({ branch_id: branchId, ingredient_id: ingId, quantity: q, reason, value_cost: q * Number(ing.cost_per_unit), created_by: employeeId })
      await onChanged()
      setQty(''); setIngId('')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const totalValue = waste.reduce((s, w) => s + Number(w.value_cost ?? 0), 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardBody>
          <h3 className="font-display text-lg mb-2">Log waste</h3>
          <Select label="Ingredient" value={ingId} onChange={(e) => setIngId(e.target.value)}>
            <option value="">Pick…</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
          <Input label="Quantity" type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value as WasteReason)}>
            <option value="expired">Expired</option>
            <option value="remake">Remake</option>
            <option value="broken">Broken</option>
            <option value="spill">Spill</option>
            <option value="overcook">Overcook</option>
            <option value="customer_return">Customer return</option>
            <option value="prep_error">Prep error</option>
            <option value="other">Other</option>
          </Select>
          {err && <Alert tone="red">{err}</Alert>}
          <Button onClick={submit} loading={busy}>Log waste</Button>
        </CardBody>
      </Card>
      <Card className="md:col-span-2">
        <CardBody>
          <div className="flex justify-between items-baseline mb-3">
            <h3 className="font-display text-lg">Waste log</h3>
            <span className="text-sm text-ink-500">Value: {MYR(totalValue)}</span>
          </div>
          {waste.length === 0 ? (
            <div className="text-sm text-ink-500">No waste recorded.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-500">
                <tr><th className="pb-2">When</th><th className="pb-2">Ingredient</th><th className="pb-2">Reason</th><th className="pb-2 text-right">Qty</th><th className="pb-2 text-right">Value</th></tr>
              </thead>
              <tbody>
                {waste.map((w) => {
                  const ing = ingredients.find((i) => i.id === w.ingredient_id)
                  return (
                    <tr key={w.id} className="border-t border-ink-100">
                      <td className="py-2">{shortDate(w.created_at)}</td>
                      <td className="py-2">{ing?.name ?? '—'}</td>
                      <td className="py-2">{w.reason}</td>
                      <td className="py-2 text-right">{Number(w.quantity).toFixed(2)} {ing?.unit}</td>
                      <td className="py-2 text-right">{MYR(Number(w.value_cost ?? 0))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function StockTakeTab({ ingredients, branchId, employeeId, onChanged }: { ingredients: Ingredient[]; branchId: string; employeeId: string | null; onChanged: () => Promise<void> }) {
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const applyVariances = async () => {
    setBusy(true); setMsg(null)
    try {
      let n = 0
      for (const i of ingredients) {
        const counted = parseFloat(counts[i.id] ?? '')
        if (!Number.isFinite(counted)) continue
        const delta = counted - Number(i.current_stock)
        if (Math.abs(delta) < 0.0005) continue
        await adjustStock(i.id, delta, 'adjustment', { branch_id: branchId, reason: 'Stock take variance', unit_cost: Number(i.cost_per_unit), created_by: employeeId ?? undefined })
        n++
      }
      await onChanged()
      setCounts({})
      setMsg(`Applied ${n} adjustments.`)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg">Stock take counting sheet</h3>
          <Button onClick={applyVariances} loading={busy}>Apply variances</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-500">
            <tr><th className="pb-2">Ingredient</th><th className="pb-2">Unit</th><th className="pb-2 text-right">System</th><th className="pb-2 text-right">Counted</th><th className="pb-2 text-right">Variance</th></tr>
          </thead>
          <tbody>
            {ingredients.map((i) => {
              const counted = parseFloat(counts[i.id] ?? '')
              const hasVal = Number.isFinite(counted)
              const variance = hasVal ? counted - Number(i.current_stock) : 0
              return (
                <tr key={i.id} className="border-t border-ink-100">
                  <td className="py-2">{i.name}</td>
                  <td className="py-2">{i.unit}</td>
                  <td className="py-2 text-right">{Number(i.current_stock).toFixed(2)}</td>
                  <td className="py-2 text-right">
                    <input type="number" step="0.001" value={counts[i.id] ?? ''} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })}
                      className="w-24 text-right text-sm" />
                  </td>
                  <td className={`py-2 text-right font-medium ${!hasVal ? 'text-ink-300' : variance < 0 ? 'text-red-600' : variance > 0 ? 'text-emerald-700' : 'text-ink-500'}`}>
                    {hasVal ? `${variance > 0 ? '+' : ''}${variance.toFixed(2)}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {msg && <div className="mt-3 text-sm">{msg}</div>}
      </CardBody>
    </Card>
  )
}
