import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, Input, Select, Spinner } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listBranches, createBranch, updateBranch,
  listIngredients, listTransfers, createTransfer, receiveTransfer,
} from '../../lib/restaurant/store'
import type { Branch, Ingredient, StockTransfer } from '../../lib/restaurant/types'
import { MYR, shortDate } from '../../lib/restaurant/format'

export default function Branches() {
  const { branchId, refreshBranches, employee } = useRestaurant()
  const [tab, setTab] = useState<'branches' | 'transfers'>('branches')
  const [branches, setBranches] = useState<Branch[]>([])
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true); setErr(null)
    try {
      const [b, t] = await Promise.all([listBranches(), listTransfers()])
      setBranches(b); setTransfers(t)
      if (branchId) setIngs(await listIngredients(branchId))
    } catch (e) { setErr((e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [branchId])

  if (loading && branches.length === 0) return <div className="py-10 text-center"><Spinner /> Loading branches…</div>

  return (
    <div className="space-y-4">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="flex gap-1">
        {(['branches','transfers'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${tab === t ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'branches' && <BranchesTab branches={branches} onChanged={async () => { await refresh(); await refreshBranches() }} />}
      {tab === 'transfers' && <TransfersTab transfers={transfers} branches={branches} ingredients={ings} srcBranchId={branchId ?? ''} employeeId={employee?.id ?? null} onChanged={refresh} />}
    </div>
  )
}

function BranchesTab({ branches, onChanged }: { branches: Branch[]; onChanged: () => Promise<void> }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', address: '', timezone: 'Asia/Kuala_Lumpur' })
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (!form.name) { setErr('Name required'); return }
    try { await createBranch({ ...form, status: 'active' }); setForm({ name: '', address: '', timezone: 'Asia/Kuala_Lumpur' }); setCreating(false); setErr(null); await onChanged() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Branches ({branches.length})</h2>
        <Button onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ New branch'}</Button>
      </div>

      {creating && <Card><CardBody>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label="Timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
        </div>
        {err && <Alert tone="red">{err}</Alert>}
        <Button onClick={save}>Save</Button>
      </CardBody></Card>}

      <div className="space-y-2">
        {branches.map((b) => (
          <Card key={b.id}><CardBody>
            <div className="flex justify-between items-center">
              <div>
                <div className="font-display flex items-center gap-2">
                  {b.name} <Badge tone={b.status === 'active' ? 'green' : 'gray'}>{b.status}</Badge>
                </div>
                <div className="text-xs text-ink-500">{b.address ?? '—'} · {b.timezone}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={async () => { await updateBranch(b.id, { status: b.status === 'active' ? 'inactive' : 'active' }); await onChanged() }}>
                  {b.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </div>
          </CardBody></Card>
        ))}
      </div>
    </div>
  )
}

function TransfersTab({ transfers, branches, ingredients, srcBranchId, employeeId, onChanged }: { transfers: StockTransfer[]; branches: Branch[]; ingredients: Ingredient[]; srcBranchId: string; employeeId: string | null; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ to_branch_id: '', ingredient_id: '', quantity: 0, unit_cost: 0 })
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!form.to_branch_id || !form.ingredient_id || form.quantity <= 0) { setErr('Fill all fields'); return }
    try {
      const ing = ingredients.find((i) => i.id === form.ingredient_id)
      await createTransfer({
        from_branch_id: srcBranchId,
        to_branch_id: form.to_branch_id,
        ingredient_id: form.ingredient_id,
        quantity: form.quantity,
        unit_cost: form.unit_cost || Number(ing?.cost_per_unit ?? 0),
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_by: employeeId,
      })
      setForm({ to_branch_id: '', ingredient_id: '', quantity: 0, unit_cost: 0 })
      setErr(null)
      await onChanged()
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <Card><CardBody>
        <h3 className="font-display text-lg mb-3">New transfer</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select label="To branch" value={form.to_branch_id} onChange={(e) => setForm({ ...form, to_branch_id: e.target.value })}>
            <option value="">Pick destination…</option>
            {branches.filter((b) => b.id !== srcBranchId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select label="Ingredient" value={form.ingredient_id} onChange={(e) => setForm({ ...form, ingredient_id: e.target.value })}>
            <option value="">Pick…</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} (stock {Number(i.current_stock).toFixed(1)} {i.unit})</option>)}
          </Select>
          <Input label="Quantity" type="number" step="0.001" value={String(form.quantity)} onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })} />
          <Input label="Unit cost (optional)" type="number" step="0.0001" value={String(form.unit_cost)} onChange={(e) => setForm({ ...form, unit_cost: parseFloat(e.target.value) || 0 })} />
        </div>
        {err && <Alert tone="red">{err}</Alert>}
        <Button onClick={save}>Send transfer</Button>
      </CardBody></Card>

      <Card><CardBody>
        <h3 className="font-display text-lg mb-3">All transfers</h3>
        {transfers.length === 0 ? (
          <div className="text-sm text-ink-500">No transfers yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500">
              <tr><th className="pb-2">When</th><th className="pb-2">From → To</th><th className="pb-2">Ingredient</th><th className="pb-2 text-right">Qty</th><th className="pb-2 text-right">Value</th><th className="pb-2">Status</th><th /></tr>
            </thead>
            <tbody>
              {transfers.map((t) => {
                const from = branches.find((b) => b.id === t.from_branch_id)?.name ?? '—'
                const to = branches.find((b) => b.id === t.to_branch_id)?.name ?? '—'
                const ing = ingredients.find((i) => i.id === t.ingredient_id)
                return (
                  <tr key={t.id} className="border-t border-ink-100">
                    <td className="py-2">{shortDate(t.created_at)}</td>
                    <td className="py-2">{from} → {to}</td>
                    <td className="py-2">{ing?.name ?? t.ingredient_id.slice(0,6)}</td>
                    <td className="py-2 text-right">{Number(t.quantity).toFixed(2)}</td>
                    <td className="py-2 text-right">{MYR(Number(t.quantity) * Number(t.unit_cost))}</td>
                    <td className="py-2"><Badge tone={t.status === 'received' ? 'green' : t.status === 'cancelled' ? 'red' : 'amber'}>{t.status}</Badge></td>
                    <td className="py-2">
                      {t.status === 'sent' && t.to_branch_id === srcBranchId && (
                        <button className="btn-ghost btn-sm" onClick={async () => { await receiveTransfer(t.id, employeeId); await onChanged() }}>Receive</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardBody></Card>
    </div>
  )
}
