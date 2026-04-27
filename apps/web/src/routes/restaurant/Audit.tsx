import { Fragment, useEffect, useState } from 'react'
import { Alert, Badge, Card, CardBody, EmptyState, Spinner, Stat } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import { listAudit, listOrders, listWaste } from '../../lib/restaurant/store'
import type { AuditLog, Order, WasteLog } from '../../lib/restaurant/types'
import { MYR, shortDate, shortTime } from '../../lib/restaurant/format'
import { listSubmissions, triggerSubmit, type MyInvoisSubmission } from '../../lib/restaurant/einvoice'

export default function Audit() {
  const { branchId } = useRestaurant()
  const [tab, setTab] = useState<'log' | 'einvoice'>('log')
  const [audit, setAudit] = useState<AuditLog[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [waste, setWaste] = useState<WasteLog[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    void (async () => {
      setLoading(true); setErr(null)
      try {
        const since = new Date(); since.setDate(since.getDate() - 30)
        const [a, o, w] = await Promise.all([listAudit(branchId, 500), listOrders(branchId, 500), listWaste(branchId, 500)])
        if (!cancelled) { setAudit(a); setOrders(o); setWaste(w) }
      } catch (e) { if (!cancelled) setErr((e as Error).message) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [branchId])

  if (!branchId) return <EmptyState title="Pick a branch first" />
  if (loading) return <div className="py-10 text-center"><Spinner /> Loading audit log…</div>

  const voidsPct = orders.length > 0 ? (orders.filter((o) => o.status === 'voided').length / orders.length) * 100 : 0
  const refunds = audit.filter((a) => a.action === 'refund')
  const refundPct = orders.length > 0 ? (refunds.length / orders.length) * 100 : 0
  const wasteValue = waste.reduce((s, w) => s + Number(w.value_cost ?? 0), 0)

  const filtered = filter.trim() ? audit.filter((a) =>
    [a.action, a.entity_type, a.reason, JSON.stringify(a.new_value)].some((v) => (v ?? '').toString().toLowerCase().includes(filter.toLowerCase())),
  ) : audit

  const exportCsv = () => {
    const rows = [
      ['created_at', 'action', 'entity_type', 'entity_id', 'reason', 'old_value', 'new_value'],
      ...filtered.map((a) => [a.created_at, a.action, a.entity_type ?? '', a.entity_id ?? '', a.reason ?? '', JSON.stringify(a.old_value ?? {}), JSON.stringify(a.new_value ?? {})]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `audit-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Voids" value={`${voidsPct.toFixed(1)}%`} hint={`${orders.filter((o) => o.status === 'voided').length} orders`} tone={voidsPct > 2 ? 'accent' : 'default'} />
        <Stat label="Refunds" value={refunds.length} hint={`${refundPct.toFixed(1)}%`} tone={refundPct > 5 ? 'accent' : 'default'} />
        <Stat label="Waste value (30d)" value={MYR(wasteValue)} />
        <Stat label="Audit entries" value={audit.length} />
      </div>

      <div className="flex gap-1">
        {(['log','einvoice'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === t ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}>
            {t === 'log' ? 'Audit log' : 'E-invoice'}
          </button>
        ))}
      </div>

      {tab === 'einvoice' && <EinvoiceTab branchId={branchId} />}

      {tab === 'log' && <Card><CardBody>
        <div className="flex items-center justify-between mb-3 gap-3">
          <input type="search" placeholder="Filter by action / reason / entity…" className="flex-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="btn-ghost btn-sm" onClick={exportCsv}>Export CSV</button>
        </div>
        {filtered.length === 0 ? (
          <div className="text-sm text-ink-500 py-8 text-center">No audit entries match.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500">
              <tr>
                <th className="pb-2">When</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Entity</th>
                <th className="pb-2">Reason</th>
                <th className="pb-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-ink-100">
                  <td className="py-2 whitespace-nowrap">{shortDate(a.created_at)} {shortTime(a.created_at)}</td>
                  <td className="py-2"><Badge tone={a.action === 'refund' ? 'red' : a.action === 'order_paid' ? 'green' : 'brand'}>{a.action}</Badge></td>
                  <td className="py-2 text-ink-500">{a.entity_type ?? '—'}</td>
                  <td className="py-2">{a.reason ?? '—'}</td>
                  <td className="py-2 text-xs text-ink-400 max-w-md truncate">{JSON.stringify(a.new_value ?? {})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody></Card>}
    </div>
  )
}

function EinvoiceTab({ branchId }: { branchId: string }) {
  const [rows, setRows] = useState<MyInvoisSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'validated' | 'failed' | 'escalated'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'sales' | 'self_billed' | 'consolidated' | 'credit_note'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true); setErr(null)
    try { setRows(await listSubmissions(branchId, 500)) }
    catch (e) { setErr((e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [branchId])

  if (loading) return <div className="py-10 text-center"><Spinner /> Loading…</div>

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending'   && !['pending','submitted','pending_retry'].includes(r.submission_status)) return false
      if (statusFilter === 'validated' && r.submission_status !== 'validated') return false
      if (statusFilter === 'failed'    && r.submission_status !== 'failed')    return false
      if (statusFilter === 'escalated' && r.submission_status !== 'escalated') return false
    }
    if (typeFilter !== 'all' && r.invoice_type !== typeFilter) return false
    return true
  })

  const toneFor = (s: string) =>
    s === 'validated' ? 'green'
    : s === 'failed' || s === 'escalated' ? 'red'
    : 'amber'

  return (
    <Card><CardBody>
      {err && <Alert tone="red">{err}</Alert>}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label className="block text-xs text-ink-500">Status</label>
          <select className="text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">All</option>
            <option value="pending">Pending / submitting / retrying</option>
            <option value="validated">Validated</option>
            <option value="failed">Failed</option>
            <option value="escalated">Escalated</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-500">Type</label>
          <select className="text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
            <option value="all">All</option>
            <option value="sales">Sales</option>
            <option value="self_billed">Self-billed</option>
            <option value="consolidated">Consolidated</option>
            <option value="credit_note">Credit note</option>
          </select>
        </div>
        <button className="btn-ghost btn-sm ml-auto" onClick={() => void refresh()}>Refresh</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No e-invoice submissions match" />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-500">
            <tr>
              <th className="pb-2">When</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">UIN</th>
              <th className="pb-2">Attempts</th>
              <th className="pb-2">Error</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-t border-ink-100 align-top">
                  <td className="py-2 whitespace-nowrap">{shortDate(r.created_at)} {shortTime(r.created_at)}</td>
                  <td className="py-2"><Badge tone="gray">{r.invoice_type}</Badge></td>
                  <td className="py-2"><Badge tone={toneFor(r.submission_status)}>{r.submission_status}</Badge></td>
                  <td className="py-2 font-mono text-xs">{r.uin ?? '—'}</td>
                  <td className="py-2">{r.attempt_count}</td>
                  <td className="py-2 text-xs text-ink-500 max-w-md truncate">{r.error_message ?? '—'}</td>
                  <td className="py-2 text-right space-x-1">
                    <button className="btn-ghost btn-sm" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      {expanded === r.id ? 'Hide' : 'Payload'}
                    </button>
                    {(r.submission_status === 'pending' || r.submission_status === 'pending_retry'
                      || r.submission_status === 'failed' || r.submission_status === 'escalated') && (
                      <button className="btn-ghost btn-sm" onClick={() => void triggerSubmit(r.id).then(() => refresh())}>
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr className="bg-ink-50">
                    <td colSpan={7} className="p-3 text-xs">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="font-semibold mb-1 text-ink-700">Request payload</div>
                          <pre className="whitespace-pre-wrap break-all text-ink-600 max-h-60 overflow-auto">{JSON.stringify(r.request_payload ?? {}, null, 2)}</pre>
                        </div>
                        <div>
                          <div className="font-semibold mb-1 text-ink-700">Validation response</div>
                          <pre className="whitespace-pre-wrap break-all text-ink-600 max-h-60 overflow-auto">{JSON.stringify(r.validation_response ?? {}, null, 2)}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </CardBody></Card>
  )
}
