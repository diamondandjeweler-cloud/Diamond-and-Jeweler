import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

type Endpoint = 'chat-support' | 'chat-onboard'
type UserRoleFilter = 'talent' | 'hiring_manager' | 'hr_admin' | 'admin' | 'all'
type DateRange = 'today' | '7d' | '30d' | 'all'
type SubTab = 'conversations' | 'questions'

interface ChatMessage {
  id: string
  conversation_id: string
  user_id: string | null
  endpoint: Endpoint
  role: 'user' | 'assistant'
  content: string
  provider: string | null
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  user_role: string | null
  created_at: string
}

interface Profile { email: string; full_name: string }

interface Conversation {
  id: string
  user_id: string | null
  endpoint: Endpoint
  user_role: string | null
  messages: ChatMessage[]
  started_at: string
  last_at: string
  user_turns: number
  ai_turns: number
  total_tokens: number
  first_question: string
  profile?: Profile | null
}

interface TopQuestion {
  content: string
  count: number
  last_seen: string
}

const FETCH_LIMIT = 1000
const TOP_QUESTIONS_MIN_COUNT = 2
const TOP_QUESTIONS_MAX = 30

export default function AIChatPanel() {
  const [tab, setTab] = useState<SubTab>('conversations')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [flagging, setFlagging] = useState<string | null>(null)
  const [flagged, setFlagged] = useState<Record<string, true>>({})

  const [endpointFilter, setEndpointFilter] = useState<Endpoint | 'all'>('all')
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>('all')
  const [dateRange, setDateRange] = useState<DateRange>('7d')
  const [search, setSearch] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setErr(null)
    let q = supabase
      .from('ai_chat_messages')
      .select('id, conversation_id, user_id, endpoint, role, content, provider, model, input_tokens, output_tokens, user_role, created_at')
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT)

    if (dateRange !== 'all') {
      const days = dateRange === 'today' ? 1 : dateRange === '7d' ? 7 : 30
      const since = new Date(Date.now() - days * 86_400_000).toISOString()
      q = q.gte('created_at', since)
    }
    if (endpointFilter !== 'all') q = q.eq('endpoint', endpointFilter)
    if (roleFilter !== 'all') q = q.eq('user_role', roleFilter)

    const { data, error } = await q
    if (error) { setErr(error.message); setLoading(false); return }

    const rows = (data ?? []) as ChatMessage[]
    setMessages(rows)

    const userIds = [...new Set(rows.map((r) => r.user_id).filter((x): x is string => !!x))]
    if (userIds.length > 0) {
      const { data: pData } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds)
      const map: Record<string, Profile> = {}
      for (const p of (pData ?? []) as Array<{ id: string; email: string; full_name: string }>) {
        map[p.id] = { email: p.email, full_name: p.full_name }
      }
      setProfiles(map)
    } else {
      setProfiles({})
    }
    setLoading(false)
  }, [endpointFilter, roleFilter, dateRange])

  useEffect(() => { void reload() }, [reload])

  // Refresh when the admin re-focuses the tab — cheaper than realtime
  // subscriptions and matches how SupportPanel handles freshness.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  const conversations = useMemo<Conversation[]>(() => {
    const byId = new Map<string, ChatMessage[]>()
    for (const m of messages) {
      const list = byId.get(m.conversation_id) ?? []
      list.push(m)
      byId.set(m.conversation_id, list)
    }
    const out: Conversation[] = []
    for (const [cid, msgs] of byId.entries()) {
      msgs.sort((a, b) => a.created_at.localeCompare(b.created_at))
      const userMsgs = msgs.filter((m) => m.role === 'user')
      const aiMsgs   = msgs.filter((m) => m.role === 'assistant')
      const first = msgs[0]
      out.push({
        id: cid,
        user_id:    first.user_id,
        endpoint:   first.endpoint,
        user_role:  first.user_role,
        messages:   msgs,
        started_at: msgs[0].created_at,
        last_at:    msgs[msgs.length - 1].created_at,
        user_turns: userMsgs.length,
        ai_turns:   aiMsgs.length,
        total_tokens: msgs.reduce((s, m) => s + (m.input_tokens ?? 0) + (m.output_tokens ?? 0), 0),
        first_question: userMsgs[0]?.content ?? '(no user message)',
        profile: first.user_id ? (profiles[first.user_id] ?? null) : null,
      })
    }
    out.sort((a, b) => b.last_at.localeCompare(a.last_at))

    if (!search.trim()) return out
    const s = search.toLowerCase()
    return out.filter((c) =>
      c.messages.some((m) => m.content.toLowerCase().includes(s)) ||
      (c.profile?.email ?? '').toLowerCase().includes(s) ||
      (c.profile?.full_name ?? '').toLowerCase().includes(s),
    )
  }, [messages, profiles, search])

  const topQuestions = useMemo<TopQuestion[]>(() => {
    const counts = new Map<string, { count: number; last_seen: string }>()
    for (const m of messages) {
      if (m.role !== 'user') continue
      const normalized = m.content.toLowerCase().trim().replace(/\s+/g, ' ')
      if (normalized.length < 3) continue
      const prev = counts.get(normalized)
      if (prev) {
        prev.count++
        if (m.created_at > prev.last_seen) prev.last_seen = m.created_at
      } else {
        counts.set(normalized, { count: 1, last_seen: m.created_at })
      }
    }
    return Array.from(counts.entries())
      .map(([content, v]) => ({ content, count: v.count, last_seen: v.last_seen }))
      .filter((q) => q.count >= TOP_QUESTIONS_MIN_COUNT)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_QUESTIONS_MAX)
  }, [messages])

  async function flagAsTicket(c: Conversation) {
    if (flagging) return
    setFlagging(c.id)
    setErr(null)
    try {
      const transcript = c.messages.map((m) => ({
        from: m.role === 'user' ? ('user' as const) : ('ai' as const),
        content: m.content,
      }))
      const summary = `[Flagged from admin] ${c.first_question.slice(0, 140)}`
      const { error } = await supabase.from('support_tickets').insert({
        user_id:  c.user_id,
        category: 'enquiry',
        summary,
        transcript,
        status:   'open',
      })
      if (error) {
        setErr(`Could not flag: ${error.message}`)
      } else {
        setFlagged((f) => ({ ...f, [c.id]: true }))
      }
    } finally {
      setFlagging(null)
    }
  }

  function endpointLabel(e: Endpoint): string {
    return e === 'chat-support' ? 'Support' : 'Onboarding'
  }
  function fmt(s: string): string {
    return new Date(s).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })
  }

  const subTabs: Array<{ key: SubTab; label: string }> = [
    { key: 'conversations', label: 'Conversations' },
    { key: 'questions',     label: 'Top questions' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-ink-900">AI chat conversations</h2>
        <button type="button" onClick={() => void reload()} className="btn-ghost btn-sm">Refresh</button>
      </div>

      {err && <p className="text-red-600 text-sm mb-4">{err}</p>}

      <div className="flex gap-1 border-b border-ink-200 mb-6 overflow-x-auto">
        {subTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap mb-4 text-sm">
        <select
          value={endpointFilter}
          onChange={(e) => setEndpointFilter(e.target.value as Endpoint | 'all')}
          className="rounded-lg border border-ink-200 px-2 py-1 bg-white"
          aria-label="Filter by endpoint"
        >
          <option value="all">All endpoints</option>
          <option value="chat-support">Support</option>
          <option value="chat-onboard">Onboarding</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRoleFilter)}
          className="rounded-lg border border-ink-200 px-2 py-1 bg-white"
          aria-label="Filter by user role"
        >
          <option value="all">All roles</option>
          <option value="talent">Talent</option>
          <option value="hiring_manager">Hiring manager</option>
          <option value="hr_admin">HR admin</option>
          <option value="admin">Admin</option>
        </select>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRange)}
          className="rounded-lg border border-ink-200 px-2 py-1 bg-white"
          aria-label="Date range"
        >
          <option value="today">Today (24h)</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        {tab === 'conversations' && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search content / email / name…"
            className="flex-1 min-w-[180px] rounded-lg border border-ink-200 px-3 py-1 bg-white"
            aria-label="Search conversations"
          />
        )}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : tab === 'conversations' ? (
        conversations.length === 0 ? (
          <p className="text-ink-500 text-sm text-center py-12">No conversations match these filters.</p>
        ) : (
          <div className="space-y-3">
            {conversations.map((c) => (
              <div key={c.id} className="border border-ink-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => (e === c.id ? null : c.id))}
                  className="w-full text-left px-5 py-4 hover:bg-ink-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700">
                          {endpointLabel(c.endpoint)}
                        </span>
                        {c.user_role && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-ink-100 text-ink-700">
                            {c.user_role}
                          </span>
                        )}
                        <span className="text-[11px] text-ink-500">
                          {c.user_turns} user · {c.ai_turns} AI · {c.total_tokens} tokens
                        </span>
                        {flagged[c.id] && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-700">
                            Ticket raised
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ink-800 font-medium truncate">
                        {c.first_question}
                      </p>
                      <p className="text-xs text-ink-500 mt-0.5">
                        {c.profile?.full_name ?? 'Unknown'} · {c.profile?.email ?? c.user_id?.slice(0, 8) ?? 'no user'} ·{' '}
                        {fmt(c.last_at)}
                      </p>
                    </div>
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`shrink-0 mt-1 text-ink-400 transition-transform ${expanded === c.id ? 'rotate-180' : ''}`}
                      aria-hidden
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {expanded === c.id && (
                  <div className="border-t border-ink-200 px-5 py-4 space-y-4 bg-ink-50/40">
                    <div>
                      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Transcript</p>
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {c.messages.map((m) => (
                          <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
                            <div
                              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                                m.role === 'user'
                                  ? 'bg-ink-900 text-white'
                                  : 'bg-white text-ink-800 border border-ink-200'
                              }`}
                            >
                              {m.content}
                              {m.role === 'assistant' && m.provider && (
                                <div className="text-[10px] mt-1 opacity-60">{m.provider}/{m.model}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap items-center">
                      <button
                        type="button"
                        onClick={() => {
                          const text = c.messages
                            .map((m) => `[${m.role}] ${m.content}`)
                            .join('\n\n')
                          void navigator.clipboard.writeText(text)
                        }}
                        className="btn-ghost btn-sm"
                      >
                        Copy transcript
                      </button>
                      <button
                        type="button"
                        onClick={() => void flagAsTicket(c)}
                        disabled={flagging === c.id || flagged[c.id]}
                        className="btn-secondary btn-sm"
                      >
                        {flagged[c.id] ? 'Ticket raised' : flagging === c.id ? 'Flagging…' : 'Flag as support ticket'}
                      </button>
                      <span className="text-[11px] text-ink-500">
                        Started {fmt(c.started_at)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : topQuestions.length === 0 ? (
        <p className="text-ink-500 text-sm text-center py-12">
          No repeated questions in this window. Widen the date range or wait for more usage.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ink-500 mb-3">
            User messages grouped by normalized text (lowercased, whitespace collapsed). Only shows
            questions asked ≥ {TOP_QUESTIONS_MIN_COUNT} times.
          </p>
          {topQuestions.map((q) => (
            <div key={q.content} className="flex items-start gap-3 border border-ink-200 rounded-lg px-4 py-3 bg-white">
              <span className="text-2xl font-bold text-brand-700 w-10 text-center shrink-0 leading-none mt-0.5">
                {q.count}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink-800 break-words">{q.content}</p>
                <p className="text-[11px] text-ink-500 mt-0.5">Last seen {fmt(q.last_seen)}</p>
              </div>
              <button
                type="button"
                onClick={() => { setSearch(q.content); setTab('conversations') }}
                className="btn-ghost btn-sm shrink-0"
              >
                View chats
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
