import { useEffect, useState } from 'react'
import LoadingSpinner from '../../../components/LoadingSpinner'
import { Button, Badge, Textarea, Select } from '../../../components/ui'
import {
  listAllSupportTickets, replyToSupportTicket, updateSupportTicketStatus, getSupportAttachmentUrl,
  type SupportTicket, type SupportStatus, type SupportPriority, type SupportCategory, type SupportFilters,
} from '../../../lib/api'
import { supabase } from '../../../lib/supabase'

const STATUS_TONES: Record<SupportStatus, 'gray' | 'amber' | 'green' | 'brand'> = {
  open: 'amber', in_progress: 'brand', resolved: 'green', closed: 'gray',
}
const STATUS_LABEL: Record<SupportStatus, string> = {
  open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed',
}

export default function SupportPanel() {
  const [rows, setRows] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filters, setFilters] = useState<SupportFilters>({ status: 'all', category: 'all', priority: 'all' })
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [emails, setEmails] = useState<Record<string, string>>({})

  const refresh = async (next: SupportFilters = filters) => {
    setLoading(true)
    try {
      const data = await listAllSupportTickets(next)
      setRows(data)
      setErr(null)
      // Best-effort fetch of submitter emails (RLS lets admins read profiles).
      const ids = Array.from(new Set(data.map((d) => d.user_id)))
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', ids)
        if (profs) {
          setEmails(Object.fromEntries(profs.map((p: { id: string; email: string }) => [p.id, p.email])))
        }
      }
    } catch (e) {
      setErr((e as Error).message ?? 'Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const applyFilters = (patch: Partial<SupportFilters>) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    void refresh(next)
  }

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    void refresh({ ...filters, search })
  }

  const active = rows.find((r) => r.id === activeId) ?? null

  if (loading && rows.length === 0) return <LoadingSpinner />

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,420px)] gap-6">
      <div>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <Select
            label="Status"
            value={filters.status ?? 'all'}
            onChange={(e) => applyFilters({ status: e.target.value as SupportStatus | 'all' })}
            className="!w-auto"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </Select>

          <Select
            label="Category"
            value={filters.category ?? 'all'}
            onChange={(e) => applyFilters({ category: e.target.value as SupportCategory | 'all' })}
            className="!w-auto"
          >
            <option value="all">All</option>
            <option value="bug">Bug</option>
            <option value="feedback">Feedback</option>
            <option value="feature_request">Feature request</option>
            <option value="account">Account</option>
            <option value="payment">Payment</option>
            <option value="other">Other</option>
          </Select>

          <Select
            label="Priority"
            value={filters.priority ?? 'all'}
            onChange={(e) => applyFilters({ priority: e.target.value as SupportPriority | 'all' })}
            className="!w-auto"
          >
            <option value="all">All</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </Select>

          <form onSubmit={onSearch} className="flex items-end gap-2 ml-auto">
            <div className="field mb-3">
              <label className="field-label">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Subject or message"
                className="w-56"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">Search</Button>
          </form>
        </div>

        {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

        {rows.length === 0 ? (
          <p className="text-sm text-ink-500">No tickets match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-500 border-b">
                  <th className="py-2 pr-3">Submitted</th>
                  <th className="pr-3">User</th>
                  <th className="pr-3">Category</th>
                  <th className="pr-3">Subject</th>
                  <th className="pr-3">Status</th>
                  <th className="pr-3">Priority</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b last:border-0 cursor-pointer hover:bg-ink-50 ${activeId === r.id ? 'bg-brand-50' : ''}`}
                    onClick={() => setActiveId(r.id)}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap text-ink-600">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="pr-3 truncate max-w-[180px]">{emails[r.user_id] ?? r.user_id.slice(0, 8)}</td>
                    <td className="pr-3">{r.category.replace('_', ' ')}</td>
                    <td className="pr-3 truncate max-w-[260px]">{r.subject}</td>
                    <td className="pr-3"><Badge tone={STATUS_TONES[r.status]} dot>{STATUS_LABEL[r.status]}</Badge></td>
                    <td className="pr-3 capitalize">{r.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        {active ? (
          <TicketDrawer
            ticket={active}
            email={emails[active.user_id]}
            onUpdated={() => void refresh()}
          />
        ) : (
          <div className="card">
            <div className="p-6 text-sm text-ink-500">Select a ticket to view and reply.</div>
          </div>
        )}
      </aside>
    </div>
  )
}

function TicketDrawer({
  ticket, email, onUpdated,
}: {
  ticket: SupportTicket
  email?: string
  onUpdated: () => void
}) {
  const [reply, setReply] = useState(ticket.admin_reply ?? '')
  const [status, setStatus] = useState<SupportStatus>(ticket.status)
  const [priority, setPriority] = useState<SupportPriority>(ticket.priority)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)

  useEffect(() => {
    setReply(ticket.admin_reply ?? '')
    setStatus(ticket.status)
    setPriority(ticket.priority)
  }, [ticket.id])

  useEffect(() => {
    if (!ticket.attachment_url) { setAttachmentUrl(null); return }
    let cancelled = false
    void getSupportAttachmentUrl(ticket.attachment_url).then((url) => {
      if (!cancelled) setAttachmentUrl(url)
    })
    return () => { cancelled = true }
  }, [ticket.attachment_url])

  const sendReply = async () => {
    if (!reply.trim()) { setErr('Reply cannot be empty.'); return }
    setBusy(true); setErr(null)
    try {
      await replyToSupportTicket(ticket.id, reply.trim(), status === 'open' ? 'in_progress' : status)
      onUpdated()
    } catch (e) {
      setErr((e as Error).message ?? 'Failed to save reply')
    } finally { setBusy(false) }
  }

  const saveMeta = async () => {
    setBusy(true); setErr(null)
    try {
      await updateSupportTicketStatus(ticket.id, status, priority)
      onUpdated()
    } catch (e) {
      setErr((e as Error).message ?? 'Failed to update')
    } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="px-6 pt-6 pb-3 border-b border-ink-100">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge tone={STATUS_TONES[ticket.status]} dot>{STATUS_LABEL[ticket.status]}</Badge>
          <Badge tone="gray">{ticket.category.replace('_', ' ')}</Badge>
          {ticket.priority !== 'normal' && (
            <Badge tone={ticket.priority === 'urgent' || ticket.priority === 'high' ? 'red' : 'gray'}>
              {ticket.priority}
            </Badge>
          )}
        </div>
        <h3 className="font-display text-base text-ink-900 break-words">{ticket.subject}</h3>
        <p className="text-xs text-ink-500 mt-1">
          From {email ?? ticket.user_id.slice(0, 8)} · {new Date(ticket.created_at).toLocaleString()}
        </p>
      </div>

      <div className="p-6 space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Message</div>
          <p className="text-sm text-ink-800 whitespace-pre-wrap break-words">{ticket.message}</p>
        </div>

        {attachmentUrl && (
          <a
            href={attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
          >
            View attachment ↗
          </a>
        )}

        {(ticket.user_agent || ticket.page_url) && (
          <details className="text-xs text-ink-500">
            <summary className="cursor-pointer">Diagnostic info</summary>
            <div className="mt-2 space-y-1 break-words">
              {ticket.page_url && <div><span className="text-ink-400">Page:</span> {ticket.page_url}</div>}
              {ticket.user_agent && <div><span className="text-ink-400">UA:</span> {ticket.user_agent}</div>}
            </div>
          </details>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as SupportStatus)}
          >
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </Select>
          <Select
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as SupportPriority)}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void saveMeta()}
          loading={busy}
        >
          Save status / priority
        </Button>

        <Textarea
          label="Reply"
          rows={5}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write a reply to the user. They'll see this on /support."
          hint={ticket.replied_at ? `Last replied ${new Date(ticket.replied_at).toLocaleString()}` : undefined}
        />

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex justify-end">
          <Button onClick={() => void sendReply()} loading={busy} disabled={busy}>
            Send reply
          </Button>
        </div>
      </div>
    </div>
  )
}
