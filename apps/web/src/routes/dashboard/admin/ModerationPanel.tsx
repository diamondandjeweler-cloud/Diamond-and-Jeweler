import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { callFunction } from '../../../lib/functions'
import LoadingSpinner from '../../../components/LoadingSpinner'

type ModStatus = 'pending' | 'flagged' | 'rejected' | 'approved'

type Category =
  | 'pyramid_mlm' | 'money_muling' | 'drugs' | 'sex_work'
  | 'advance_fee_scam' | 'unlicensed_finance' | 'underage'
  | 'visa_fraud' | 'other_illegal' | 'clean'

interface FlaggedRole {
  id: string
  title: string
  description: string | null
  industry: string | null
  department: string | null
  location: string | null
  employment_type: string | null
  salary_min: number | null
  salary_max: number | null
  hourly_rate: number | null
  is_commission_based: boolean | null
  status: string
  created_at: string
  moderation_status: ModStatus
  moderation_score: number | null
  moderation_category: Category | null
  moderation_reason: string | null
  moderation_provider: string | null
  moderation_checked_at: string | null
  moderation_appeal_text: string | null
  moderation_appealed_at: string | null
  hiring_managers: {
    id: string
    profile_id: string
    companies: { name: string | null } | null
    profiles: { email: string | null; full_name: string | null } | null
  } | null
}

interface ModEvent {
  id: string
  event_type: string
  prev_status: string | null
  new_status: string | null
  score: number | null
  category: string | null
  reason: string | null
  provider: string | null
  created_at: string
}

const CATEGORY_LABELS: Record<Category, string> = {
  pyramid_mlm: 'Pyramid / MLM',
  money_muling: 'Money muling',
  drugs: 'Drugs',
  sex_work: 'Sex work',
  advance_fee_scam: 'Advance-fee scam',
  unlicensed_finance: 'Unlicensed finance',
  underage: 'Underage hiring',
  visa_fraud: 'Visa fraud',
  other_illegal: 'Other illegal',
  clean: 'Clean',
}

const SEVERITY_TONE: Record<Category, string> = {
  pyramid_mlm: 'bg-amber-50 text-amber-800 border-amber-200',
  money_muling: 'bg-red-50 text-red-800 border-red-200',
  drugs: 'bg-red-50 text-red-800 border-red-200',
  sex_work: 'bg-red-50 text-red-800 border-red-200',
  advance_fee_scam: 'bg-amber-50 text-amber-800 border-amber-200',
  unlicensed_finance: 'bg-amber-50 text-amber-800 border-amber-200',
  underage: 'bg-red-50 text-red-800 border-red-200',
  visa_fraud: 'bg-amber-50 text-amber-800 border-amber-200',
  other_illegal: 'bg-amber-50 text-amber-800 border-amber-200',
  clean: 'bg-green-50 text-green-800 border-green-200',
}

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>
  const color = score >= 70 ? 'bg-red-500' : score >= 25 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-700 w-7 text-right">{score}</span>
    </div>
  )
}

export default function ModerationPanel() {
  const [tab, setTab] = useState<'flagged' | 'rejected' | 'pending'>('flagged')
  const [rows, setRows] = useState<FlaggedRole[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [events, setEvents] = useState<Record<string, ModEvent[]>>({})
  const [processing, setProcessing] = useState<string | null>(null)
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({})
  const [counts, setCounts] = useState<{ flagged: number; rejected: number; pending: number }>({
    flagged: 0, rejected: 0, pending: 0,
  })

  async function loadCounts() {
    const buckets: Array<'flagged' | 'rejected' | 'pending'> = ['flagged', 'rejected', 'pending']
    const out = { flagged: 0, rejected: 0, pending: 0 }
    await Promise.all(buckets.map(async (s) => {
      const { count } = await supabase.from('roles').select('id', { count: 'exact', head: true })
        .eq('moderation_status', s)
      out[s] = count ?? 0
    }))
    setCounts(out)
  }

  async function reload() {
    setLoading(true)
    setErr(null)
    try {
      const { data, error } = await supabase
        .from('roles')
        .select(`
          id, title, description, industry, department, location, employment_type,
          salary_min, salary_max, hourly_rate, is_commission_based, status, created_at,
          moderation_status, moderation_score, moderation_category, moderation_reason,
          moderation_provider, moderation_checked_at, moderation_appeal_text,
          moderation_appealed_at,
          hiring_managers!inner(
            id, profile_id,
            companies(name),
            profiles!hiring_managers_profile_id_fkey(email, full_name)
          )
        `)
        .eq('moderation_status', tab)
        .order('moderation_appealed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(100)
        .abortSignal(AbortSignal.timeout(20_000))
      if (error) setErr(error.message)
      else setRows((data ?? []) as unknown as FlaggedRole[])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load moderation queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCounts()
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function loadEvents(roleId: string) {
    if (events[roleId]) return
    const { data } = await supabase
      .from('role_moderation_events')
      .select('id, event_type, prev_status, new_status, score, category, reason, provider, created_at')
      .eq('role_id', roleId)
      .order('created_at', { ascending: false })
      .limit(20)
    setEvents((prev) => ({ ...prev, [roleId]: (data ?? []) as ModEvent[] }))
  }

  function toggleExpand(r: FlaggedRole) {
    if (expanded === r.id) {
      setExpanded(null)
    } else {
      setExpanded(r.id)
      void loadEvents(r.id)
    }
  }

  async function decide(role: FlaggedRole, decision: 'approved' | 'rejected') {
    const reason = reasonDraft[role.id]?.trim() || (
      decision === 'approved'
        ? 'Reviewed by admin — meets platform policy.'
        : 'Reviewed by admin — does not meet platform policy.'
    )
    setProcessing(role.id)
    const { error } = await supabase.rpc('admin_decide_role_moderation', {
      p_role_id: role.id,
      p_decision: decision,
      p_reason: reason,
      p_category: role.moderation_category,
    })
    if (error) {
      setErr(error.message)
      setProcessing(null)
      return
    }
    // If approved, kick a fresh match-generate immediately.
    if (decision === 'approved') {
      callFunction('match-generate', { role_id: role.id }).catch(() => {/* best effort */})
    }
    setProcessing(null)
    setExpanded(null)
    await Promise.all([reload(), loadCounts()])
  }

  async function recheck(roleId: string) {
    setProcessing(roleId)
    try {
      await callFunction('moderate-role', { role_id: roleId, force: true })
      await Promise.all([reload(), loadCounts()])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Recheck failed')
    } finally {
      setProcessing(null)
    }
  }

  const tabs = useMemo(() => ([
    { key: 'flagged' as const, label: 'Flagged for review', count: counts.flagged, tone: 'amber' },
    { key: 'rejected' as const, label: 'Auto-rejected',     count: counts.rejected, tone: 'red' },
    { key: 'pending' as const,  label: 'Pending classify',  count: counts.pending,  tone: 'gray' },
  ]), [counts])

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition ${
              tab === t.key
                ? 'border-gray-900 text-gray-900 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-2 inline-flex items-center justify-center rounded-full text-xs px-1.5 min-w-[1.25rem] ${
                t.tone === 'red' ? 'bg-red-100 text-red-700'
                : t.tone === 'amber' ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-700'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => { void reload(); void loadCounts() }} className="text-xs border px-2 py-1 rounded hover:bg-gray-50">
          Refresh
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Roles posted to the platform are screened by an AI classifier (keyword + LLM).
        Anything scoring 25–69 lands here; ≥ 70 goes to auto-rejected; ≥ 75 from the keyword
        prefilter is auto-rejected on the spot. Approve to release into matching, reject to
        keep blocked. Employer can appeal a rejection once.
      </p>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      {loading ? <LoadingSpinner /> : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing in this bucket.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const cat = (r.moderation_category ?? 'other_illegal') as Category
            const isAppeal = !!r.moderation_appealed_at
            const employer = r.hiring_managers?.profiles
            const company = r.hiring_managers?.companies?.name
            return (
              <div key={r.id} className="bg-white border rounded-lg overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 truncate">{r.title}</span>
                      <span className={`text-xs border rounded px-1.5 py-0.5 ${SEVERITY_TONE[cat]}`}>
                        {CATEGORY_LABELS[cat]}
                      </span>
                      {isAppeal && (
                        <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                          Appealed
                        </span>
                      )}
                      {r.moderation_provider && (
                        <span className="text-xs text-gray-400">via {r.moderation_provider}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {company && <span>{company}</span>}
                      {company && employer && <span> · </span>}
                      {employer && <span>{employer.full_name ?? employer.email}</span>}
                      {(company || employer) && <span> · </span>}
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    {r.moderation_reason && (
                      <p className="text-xs text-gray-700 mt-2 italic">"{r.moderation_reason}"</p>
                    )}
                    <div className="mt-2"><ScoreBar score={r.moderation_score} /></div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => void decide(r, 'approved')}
                      disabled={processing === r.id}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void decide(r, 'rejected')}
                      disabled={processing === r.id}
                      className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs rounded hover:bg-red-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => toggleExpand(r)}
                      className="px-3 py-1.5 bg-gray-50 text-gray-600 border text-xs rounded hover:bg-gray-100"
                    >
                      {expanded === r.id ? 'Hide' : 'Details'}
                    </button>
                  </div>
                </div>

                {expanded === r.id && (
                  <div className="border-t bg-gray-50 p-4 space-y-3">
                    {/* Posting body */}
                    <div className="bg-white border rounded p-3 text-sm">
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
                        <div><strong>Industry:</strong> {r.industry ?? '—'}</div>
                        <div><strong>Department:</strong> {r.department ?? '—'}</div>
                        <div><strong>Location:</strong> {r.location ?? '—'}</div>
                        <div><strong>Type:</strong> {r.employment_type ?? '—'}</div>
                        <div><strong>Salary:</strong> RM {r.salary_min ?? '?'} – {r.salary_max ?? '?'}</div>
                        <div><strong>Hourly:</strong> {r.hourly_rate ? `RM ${r.hourly_rate}` : '—'}</div>
                      </div>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {r.description?.trim() || <em className="text-gray-400">No description provided.</em>}
                      </p>
                    </div>

                    {/* Appeal text */}
                    {r.moderation_appeal_text && (
                      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                        <p className="text-xs font-semibold text-blue-900 mb-1">
                          Employer appeal
                          {r.moderation_appealed_at && (
                            <span className="font-normal text-blue-700"> · {new Date(r.moderation_appealed_at).toLocaleString()}</span>
                          )}
                        </p>
                        <p className="text-sm text-blue-900 whitespace-pre-wrap">{r.moderation_appeal_text}</p>
                      </div>
                    )}

                    {/* Decision note */}
                    <div>
                      <label htmlFor={`mod-note-${r.id}`} className="block text-xs font-semibold text-gray-700 mb-1">
                        Decision note (optional, shown to employer)
                      </label>
                      <textarea
                        id={`mod-note-${r.id}`}
                        rows={2}
                        value={reasonDraft[r.id] ?? ''}
                        onChange={(e) => setReasonDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                        className="w-full text-sm border rounded p-2"
                        placeholder="e.g. Confirmed legitimate licensed forex broker — approved."
                      />
                    </div>

                    {/* Recheck */}
                    <button
                      onClick={() => void recheck(r.id)}
                      disabled={processing === r.id}
                      className="text-xs px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
                    >
                      Re-run AI classifier
                    </button>

                    {/* Event history */}
                    {events[r.id] && events[r.id].length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-1">History</p>
                        <ul className="text-xs text-gray-700 space-y-1">
                          {events[r.id].map((e) => (
                            <li key={e.id} className="border-l-2 border-gray-200 pl-2">
                              <strong>{e.event_type}</strong>
                              {e.prev_status && e.new_status && (
                                <span> — {e.prev_status} → {e.new_status}</span>
                              )}
                              {e.score != null && <span> · score {e.score}</span>}
                              {e.category && <span> · {e.category}</span>}
                              {e.provider && <span> · {e.provider}</span>}
                              <span className="text-gray-400"> · {new Date(e.created_at).toLocaleString()}</span>
                              {e.reason && <p className="text-gray-600 ml-1 italic">"{e.reason}"</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="text-xs text-gray-400">
                      <Link to={`/hm/roles/${r.id}/edit`} className="underline hover:text-gray-600">
                        Open role editor →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
