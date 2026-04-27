import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Select, Spinner, Stat } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import {
  listPromotions, createPromotion, updatePromotion,
  listMembers, upsertMembership,
} from '../../lib/restaurant/store'
import type { Membership, Promotion, PromotionType } from '../../lib/restaurant/types'
import { shortDate } from '../../lib/restaurant/format'

export default function Promotions() {
  const { branchId } = useRestaurant()
  const [tab, setTab] = useState<'promos' | 'members'>('promos')
  const [promos, setPromos] = useState<Promotion[]>([])
  const [members, setMembers] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const refresh = async () => {
    if (!branchId) return
    setLoading(true); setErr(null)
    try {
      const [p, m] = await Promise.all([listPromotions(branchId), listMembers(branchId)])
      setPromos(p); setMembers(m)
    } catch (e) { setErr((e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [branchId])

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading && promos.length === 0) return <div className="py-10 text-center"><Spinner /> Loading…</div>

  return (
    <div className="space-y-4">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="flex gap-1">
        {(['promos','members'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${tab === t ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}>
            {t === 'promos' ? 'Promotions' : 'Members'}
          </button>
        ))}
      </div>

      {tab === 'promos' && <PromosTab promos={promos} branchId={branchId} onChanged={refresh} />}
      {tab === 'members' && <MembersTab members={members} branchId={branchId} onChanged={refresh} />}
    </div>
  )
}

function PromosTab({ promos, branchId, onChanged }: { promos: Promotion[]; branchId: string; onChanged: () => Promise<void> }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ name: string; type: PromotionType; discount_pct: number; discount_amount: number; start_time: string; end_time: string; min_spend: number; code: string; start_date: string; end_date: string }>({
    name: '', type: 'time_based', discount_pct: 10, discount_amount: 0, start_time: '17:00', end_time: '19:00', min_spend: 0, code: '', start_date: '', end_date: '',
  })
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!form.name) { setErr('Name required'); return }
    const rule: Record<string, unknown> = { min_spend: form.min_spend }
    if (form.discount_pct > 0) rule.discount_pct = form.discount_pct
    if (form.discount_amount > 0) rule.discount_amount = form.discount_amount
    if (form.type === 'time_based') { rule.start_time = form.start_time; rule.end_time = form.end_time }
    try {
      await createPromotion({
        branch_id: branchId,
        name: form.name,
        type: form.type,
        rule_json: rule,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        is_active: true,
        code: form.type === 'coupon' ? form.code.toUpperCase() : null,
      })
      await onChanged()
      setCreating(false); setErr(null)
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Promotions ({promos.length})</h2>
        <Button onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ New promotion'}</Button>
      </div>

      {creating && <Card><CardBody>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PromotionType })}>
            <option value="time_based">Time-based (happy hour)</option>
            <option value="coupon">Coupon code</option>
            <option value="bogo">BOGO</option>
            <option value="combo">Combo</option>
            <option value="membership">Membership</option>
            <option value="percent_off">Percent off</option>
            <option value="flat_off">Flat off</option>
          </Select>
          {form.type === 'coupon' && <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WELCOME10" />}
          <Input label="Discount %" type="number" value={String(form.discount_pct)} onChange={(e) => setForm({ ...form, discount_pct: parseFloat(e.target.value) || 0 })} />
          <Input label="Discount amount (RM)" type="number" step="0.01" value={String(form.discount_amount)} onChange={(e) => setForm({ ...form, discount_amount: parseFloat(e.target.value) || 0 })} />
          <Input label="Min spend (RM)" type="number" step="0.01" value={String(form.min_spend)} onChange={(e) => setForm({ ...form, min_spend: parseFloat(e.target.value) || 0 })} />
          {form.type === 'time_based' && <>
            <Input label="Start time (HH:MM)" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            <Input label="End time (HH:MM)" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </>}
          <Input label="Valid from" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <Input label="Valid until" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </div>
        {err && <Alert tone="red">{err}</Alert>}
        <Button onClick={save}>Save promotion</Button>
      </CardBody></Card>}

      {promos.length === 0 ? <EmptyState title="No promotions yet" /> : (
        <div className="space-y-2">
          {promos.map((p) => (
            <Card key={p.id}><CardBody>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-display flex items-center gap-2">
                    {p.name}
                    <Badge tone={p.type === 'coupon' ? 'accent' : 'brand'}>{p.type}</Badge>
                    {p.code && <Badge tone="gray">{p.code}</Badge>}
                    {!p.is_active && <Badge tone="red">inactive</Badge>}
                  </div>
                  <div className="text-xs text-ink-500 mt-1">
                    {shortDate(p.start_date ?? undefined)} → {shortDate(p.end_date ?? undefined)} · {p.usage_count} uses{p.usage_limit ? ` / ${p.usage_limit}` : ''}
                  </div>
                  <div className="text-xs text-ink-400 mt-1">
                    Rule: {JSON.stringify(p.rule_json)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={async () => { await updatePromotion(p.id, { is_active: !p.is_active }); await onChanged() }}>
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </div>
            </CardBody></Card>
          ))}
        </div>
      )}
    </div>
  )
}

function MembersTab({ members, branchId, onChanged }: { members: Membership[]; branchId: string; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', birthday: '' })
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!form.phone) { setErr('Phone required'); return }
    try {
      await upsertMembership({ branch_id: branchId, ...form, birthday: form.birthday || null })
      await onChanged()
      setForm({ name: '', phone: '', email: '', birthday: '' })
      setErr(null)
    } catch (e) { setErr((e as Error).message) }
  }

  const totalPoints = members.reduce((s, m) => s + Number(m.points), 0)
  const topTier = members.filter((m) => m.tier === 'gold' || m.tier === 'platinum')

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-1 space-y-3">
        <Stat label="Members" value={members.length} />
        <Stat label="Points outstanding" value={totalPoints.toLocaleString()} />
        <Stat label="Gold/Platinum" value={topTier.length} tone="brand" />
        <Card><CardBody>
          <h3 className="font-display text-lg mb-3">New member</h3>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Birthday" type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
          {err && <Alert tone="red">{err}</Alert>}
          <Button onClick={save}>Add member</Button>
        </CardBody></Card>
      </div>

      <Card className="md:col-span-2"><CardBody className="p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-500 bg-ink-50">
            <tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Tier</th><th className="p-3 text-right">Points</th><th className="p-3">Birthday</th></tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-ink-500">No members yet.</td></tr>
            ) : members.map((m) => (
              <tr key={m.id} className="border-t border-ink-100">
                <td className="p-3">{m.name ?? '—'}</td>
                <td className="p-3">{m.phone ?? '—'}</td>
                <td className="p-3"><Badge tone={m.tier === 'platinum' ? 'accent' : m.tier === 'gold' ? 'amber' : 'gray'}>{m.tier}</Badge></td>
                <td className="p-3 text-right font-medium">{m.points}</td>
                <td className="p-3">{m.birthday ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody></Card>
    </div>
  )
}
