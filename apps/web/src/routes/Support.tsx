import { useEffect, useState, type FormEvent } from 'react'
import {
  PageHeader, Card, CardBody, CardHeader, Button, Input, Textarea, Select, Badge, EmptyState,
} from '../components/ui'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  createSupportTicket, listMySupportTickets, getSupportAttachmentUrl,
  type SupportTicket, type SupportCategory,
} from '../lib/api'

const CATEGORIES: Array<{ value: SupportCategory; label: string }> = [
  { value: 'bug',             label: 'Bug / something broken' },
  { value: 'feedback',        label: 'General feedback' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'account',         label: 'Account / login' },
  { value: 'payment',         label: 'Payment / billing' },
  { value: 'other',           label: 'Other' },
]

const STATUS_TONES: Record<SupportTicket['status'], 'gray' | 'amber' | 'green' | 'brand'> = {
  open:         'amber',
  in_progress:  'brand',
  resolved:     'green',
  closed:       'gray',
}

const STATUS_LABELS: Record<SupportTicket['status'], string> = {
  open:         'Open',
  in_progress:  'In progress',
  resolved:     'Resolved',
  closed:       'Closed',
}

export default function Support() {
  const [tab, setTab] = useState<'new' | 'list'>('new')
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listErr, setListErr] = useState<string | null>(null)

  const refresh = async () => {
    setListLoading(true)
    try {
      const rows = await listMySupportTickets()
      setTickets(rows)
      setListErr(null)
    } catch (e) {
      setListErr((e as Error).message ?? 'Failed to load tickets')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Help & feedback"
        title="Support"
        description="Found a bug, want to share feedback, or need help? File a ticket and we'll get back to you."
      />

      <div className="flex gap-1 border-b border-ink-200 mb-6" role="tablist" aria-label="Support sections">
        <TabButton active={tab === 'new'} onClick={() => setTab('new')}>New ticket</TabButton>
        <TabButton active={tab === 'list'} onClick={() => setTab('list')}>
          My tickets{tickets.length > 0 && <span className="ml-1.5 text-ink-400">({tickets.length})</span>}
        </TabButton>
      </div>

      {tab === 'new' ? (
        <NewTicketForm onSubmitted={() => { setTab('list'); void refresh() }} />
      ) : listLoading ? (
        <LoadingSpinner />
      ) : listErr ? (
        <p className="text-sm text-red-600">{listErr}</p>
      ) : tickets.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          description="When you submit feedback or report an issue, it will appear here."
          action={<Button onClick={() => setTab('new')}>File a ticket</Button>}
        />
      ) : (
        <div className="space-y-4">
          {tickets.map((t) => <TicketCard key={t.id} ticket={t} />)}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-brand-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'
      }`}
    >
      {children}
    </button>
  )
}

function NewTicketForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [category, setCategory] = useState<SupportCategory>('bug')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) {
      setErr('Subject and message are required.')
      return
    }
    setSubmitting(true)
    setErr(null)
    try {
      await createSupportTicket({ category, subject, message, attachment: file })
      setOk(true)
      setSubject(''); setMessage(''); setFile(null); setCategory('bug')
      setTimeout(() => { setOk(false); onSubmitted() }, 700)
    } catch (e) {
      setErr((e as Error).message ?? 'Failed to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader title="File a new ticket" subtitle="We read every submission. Most replies arrive within 1–2 business days." />
      <CardBody>
        <form onSubmit={(e) => void submit(e)} noValidate>
          <Select
            label="Category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCategory)}
          >
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>

          <Input
            label="Subject"
            required
            maxLength={200}
            placeholder="Short summary of the issue"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <Textarea
            label="Details"
            required
            rows={6}
            maxLength={5000}
            placeholder="Tell us what happened, what you expected, and any steps to reproduce."
            hint={`${message.length}/5000`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <div className="field mb-3">
            <label className="field-label">Attachment (optional)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block text-sm"
            />
            <p className="field-hint">Max 5 MB. JPG, PNG, WEBP, GIF, or PDF.</p>
          </div>

          {err && <p className="text-sm text-red-600 mb-3" role="alert">{err}</p>}
          {ok  && <p className="text-sm text-emerald-600 mb-3" role="status">Submitted — thank you.</p>}

          <div className="flex justify-end gap-2">
            <Button type="submit" loading={submitting} disabled={submitting}>
              Submit ticket
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!ticket.attachment_url) return
    let cancelled = false
    void getSupportAttachmentUrl(ticket.attachment_url).then((url) => {
      if (!cancelled) setAttachmentUrl(url)
    })
    return () => { cancelled = true }
  }, [ticket.attachment_url])

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge tone={STATUS_TONES[ticket.status]} dot>{STATUS_LABELS[ticket.status]}</Badge>
              <Badge tone="gray">{ticket.category.replace('_', ' ')}</Badge>
              {ticket.priority !== 'normal' && (
                <Badge tone={ticket.priority === 'urgent' || ticket.priority === 'high' ? 'red' : 'gray'}>
                  {ticket.priority}
                </Badge>
              )}
            </div>
            <h3 className="font-display text-base text-ink-900 truncate">{ticket.subject}</h3>
          </div>
          <span className="text-xs text-ink-500 shrink-0">
            {new Date(ticket.created_at).toLocaleDateString()}
          </span>
        </div>

        <p className="text-sm text-ink-700 whitespace-pre-wrap break-words">{ticket.message}</p>

        {attachmentUrl && (
          <a
            href={attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
          >
            View attachment ↗
          </a>
        )}

        {ticket.admin_reply && (
          <div className="mt-4 p-3 rounded-md bg-ink-50 border border-ink-100">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">
              Reply from support
              {ticket.replied_at && (
                <span className="ml-2 font-normal lowercase">
                  · {new Date(ticket.replied_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <p className="text-sm text-ink-800 whitespace-pre-wrap break-words">{ticket.admin_reply}</p>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
