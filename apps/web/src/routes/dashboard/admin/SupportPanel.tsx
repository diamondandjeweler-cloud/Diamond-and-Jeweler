import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

type TicketStatus = 'open' | 'in_progress' | 'resolved'
type TicketCategory = 'enquiry' | 'bug' | 'feature' | 'payment'

interface TranscriptMessage { from: 'ai' | 'user'; content: string }

interface Ticket {
  id: string
  user_id: string | null
  category: TicketCategory
  payment_sub_type: string | null
  summary: string | null
  transcript: TranscriptMessage[]
  status: TicketStatus
  admin_notes: string | null
  payment_transaction_id: string | null
  payment_amount: number | null
  payment_status_snapshot: string | null
  created_at: string
  resolved_at: string | null
  profiles?: { email: string; full_name: string } | null
}

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  enquiry: 'Enquiry',
  bug: 'Bug',
  feature: 'Feature',
  payment: 'Payment',
}

const CATEGORY_COLOR: Record<TicketCategory, string> = {
  enquiry: 'bg-blue-100 text-blue-700',
  bug: 'bg-orange-100 text-orange-700',
  feature: 'bg-purple-100 text-purple-700',
  payment: 'bg-red-100 text-red-700',
}

const STATUS_COLOR: Record<TicketStatus, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
}

export default function SupportPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | TicketStatus>('open')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState<Record<string, string>>({})
  const [working, setWorking] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    let q = supabase
      .from('support_tickets')
      .select('id, user_id, category, payment_sub_type, summary, transcript, status, admin_notes, payment_transaction_id, payment_amount, payment_status_snapshot, created_at, resolved_at')
      .order('created_at', { ascending: false })
    if (filter !== 'all') q = q.eq('status', filter)
    const { data, error } = await q.limit(100)
    if (error) { setErr(error.message); setLoading(false); return }

    const tickets = (data ?? []) as unknown as Omit<Ticket, 'profiles'>[]
    const userIds = [...new Set(tickets.map((t) => t.user_id).filter(Boolean))] as string[]
    const profilesById: Record<string, { email: string; full_name: string }> = {}
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds)
      for (const p of profileData ?? []) profilesById[(p as { id: string; email: string; full_name: string }).id] = { email: (p as { id: string; email: string; full_name: string }).email, full_name: (p as { id: string; email: string; full_name: string }).full_name }
    }
    setTickets(tickets.map((t) => ({ ...t, profiles: t.user_id ? (profilesById[t.user_id] ?? null) : null })) as Ticket[])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload() }, [filter])

  async function setStatus(ticket: Ticket, status: TicketStatus) {
    setWorking(ticket.id)
    const patch: Record<string, unknown> = { status }
    if (status === 'resolved') patch.resolved_at = new Date().toISOString()
    const { error } = await supabase.from('support_tickets').update(patch).eq('id', ticket.id)
    if (error) setErr(error.message)
    else await reload()
    setWorking(null)
  }

  async function saveNote(ticket: Ticket) {
    const note = noteInput[ticket.id]?.trim()
    if (!note) return
    setWorking(ticket.id)
    const { error } = await supabase.from('support_tickets').update({ admin_notes: note }).eq('id', ticket.id)
    if (error) setErr(error.message)
    else { setNoteInput((n) => ({ ...n, [ticket.id]: '' })); await reload() }
    setWorking(null)
  }

  const filterTabs: Array<{ key: 'all' | TicketStatus; label: string }> = [
    { key: 'open',        label: 'Open' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'resolved',    label: 'Resolved' },
    { key: 'all',         label: 'All' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-ink-900">Support tickets</h2>
        <button type="button" onClick={() => void reload()} className="btn-ghost btn-sm">Refresh</button>
      </div>

      {err && <p className="text-red-600 text-sm mb-4">{err}</p>}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-ink-200 mb-6 overflow-x-auto">
        {filterTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              filter === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : tickets.length === 0 ? (
        <p className="text-ink-500 text-sm text-center py-12">No tickets found.</p>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="border border-ink-200 rounded-xl overflow-hidden bg-white">
              {/* Ticket summary row */}
              <button
                type="button"
                onClick={() => setExpanded((e) => e === ticket.id ? null : ticket.id)}
                className="w-full text-left px-5 py-4 hover:bg-ink-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${CATEGORY_COLOR[ticket.category]}`}>
                        {CATEGORY_LABEL[ticket.category]}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLOR[ticket.status]}`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                      {ticket.category === 'payment' && (
                        <span className="text-[11px] text-red-600 font-semibold">⚠ HIGH PRIORITY</span>
                      )}
                    </div>
                    <p className="text-sm text-ink-800 font-medium truncate">
                      {ticket.summary ?? 'No summary'}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {ticket.profiles?.full_name ?? 'Unknown'} · {ticket.profiles?.email ?? ticket.user_id?.slice(0, 8)} ·{' '}
                      {new Date(ticket.created_at).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`shrink-0 mt-1 text-ink-400 transition-transform ${expanded === ticket.id ? 'rotate-180' : ''}`}
                    aria-hidden
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </button>

              {/* Expanded detail */}
              {expanded === ticket.id && (
                <div className="border-t border-ink-200 px-5 py-4 space-y-4 bg-ink-50/40">
                  {/* Transcript */}
                  <div>
                    <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Chat transcript</p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {(ticket.transcript ?? []).map((m, i) => (
                        <div key={i} className={`flex gap-2 ${m.from === 'user' ? 'justify-end' : ''}`}>
                          <div
                            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                              m.from === 'user'
                                ? 'bg-ink-900 text-white'
                                : 'bg-white text-ink-800 border border-ink-200'
                            }`}
                          >
                            {m.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment detail */}
                  {ticket.category === 'payment' && (ticket.payment_amount || ticket.payment_transaction_id) && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                      <p className="font-semibold text-red-700 mb-1">Payment details</p>
                      {ticket.payment_amount && <p className="text-red-800">Amount: RM {ticket.payment_amount}</p>}
                      {ticket.payment_transaction_id && <p className="text-red-800">Transaction ID: {ticket.payment_transaction_id}</p>}
                      {ticket.payment_status_snapshot && <p className="text-red-800">Status: {ticket.payment_status_snapshot}</p>}
                    </div>
                  )}

                  {/* Admin notes */}
                  {ticket.admin_notes && (
                    <div>
                      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1">Admin notes</p>
                      <p className="text-sm text-ink-700 bg-white border border-ink-200 rounded-lg px-3 py-2">{ticket.admin_notes}</p>
                    </div>
                  )}

                  {/* Add note */}
                  <div>
                    <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1">Add note</p>
                    <div className="flex gap-2">
                      <textarea
                        value={noteInput[ticket.id] ?? ''}
                        onChange={(e) => setNoteInput((n) => ({ ...n, [ticket.id]: e.target.value }))}
                        rows={2}
                        className="flex-1 resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="Internal note (not visible to user)…"
                      />
                      <button
                        type="button"
                        onClick={() => void saveNote(ticket)}
                        disabled={!noteInput[ticket.id]?.trim() || working === ticket.id}
                        className="btn-secondary btn-sm self-end"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    {ticket.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => void setStatus(ticket, 'in_progress')}
                        disabled={working === ticket.id}
                        className="btn-secondary btn-sm"
                      >
                        Mark in progress
                      </button>
                    )}
                    {ticket.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => void setStatus(ticket, 'resolved')}
                        disabled={working === ticket.id}
                        className="btn-primary btn-sm"
                      >
                        Resolve &amp; close
                      </button>
                    )}
                    {ticket.status === 'resolved' && (
                      <button
                        type="button"
                        onClick={() => void setStatus(ticket, 'open')}
                        disabled={working === ticket.id}
                        className="btn-ghost btn-sm"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
