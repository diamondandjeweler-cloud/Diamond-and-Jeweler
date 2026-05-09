import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface PendingMatch {
  id: string
  compatibility_score: number | null
  tag_compatibility: number | null
  life_chart_score: number | null
  internal_reasoning: Record<string, unknown> | null
  created_at: string
  roles: {
    title: string
    industry: string | null
    description: string | null
    hiring_managers: {
      life_chart_character: string | null
      date_of_birth_encrypted: string | null
    } | null
  } | null
  talents: {
    id: string
    life_chart_character: string | null
    date_of_birth_encrypted: string | null
    derived_tags: Record<string, number> | null
  } | null
}

const TOP_TAGS = [
  'ownership', 'communication_clarity', 'emotional_maturity', 'problem_solving',
  'resilience', 'results_orientation', 'professional_attitude', 'confidence', 'coachability',
]

const TAG_LABELS: Record<string, string> = {
  ownership: 'Ownership', communication_clarity: 'Clarity', emotional_maturity: 'EQ',
  problem_solving: 'Problem solving', resilience: 'Resilience', results_orientation: 'Results',
  professional_attitude: 'Attitude', confidence: 'Confidence', coachability: 'Coachability',
}

function ScoreBadge({ value, label }: { value: number | null; label: string }) {
  if (value == null) return <span className="text-gray-400 text-xs">{label}: —</span>
  const pct = Math.round(value)
  const color = pct >= 70 ? 'text-green-700' : pct >= 45 ? 'text-amber-600' : 'text-red-600'
  return <span className={`text-xs font-medium ${color}`}>{label}: {pct}%</span>
}

export default function MatchApprovalPanel() {
  const [rows, setRows] = useState<PendingMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dobCache, setDobCache] = useState<Record<string, { hm: string | null; talent: string | null; expiresAt: number }>>({})
  const [processing, setProcessing] = useState<string | null>(null)
  const [autopilot, setAutopilot] = useState(false)
  const [autopilotLoading, setAutopilotLoading] = useState(true)

  async function loadMode() {
    try {
      const { data } = await supabase.from('system_config').select('value').eq('key', 'match_approval_mode').maybeSingle()
      setAutopilot((data?.value as string | null) === 'autopilot')
    } finally {
      setAutopilotLoading(false)
    }
  }

  async function reload() {
    setLoading(true)
    setErr(null)
    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          id, compatibility_score, tag_compatibility, life_chart_score, internal_reasoning, created_at,
          roles(title, industry, description, hiring_managers(life_chart_character, date_of_birth_encrypted)),
          talents(id, life_chart_character, date_of_birth_encrypted, derived_tags)
        `)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false })
        .limit(100)
        .abortSignal(AbortSignal.timeout(20_000))
      if (error) setErr(error.message)
      else setRows((data ?? []) as unknown as PendingMatch[])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load pending matches')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMode()
    void reload()
  }, [])

  // Auto-expire decrypted DOBs after 5 minutes of inactivity.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setDobCache((prev) => {
        const expired = Object.keys(prev).filter((k) => prev[k].expiresAt < now)
        if (expired.length === 0) return prev
        const next = { ...prev }
        for (const k of expired) delete next[k]
        return next
      })
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  async function decryptDobs(matchId: string, hmEnc: string | null, talentEnc: string | null) {
    const cached = dobCache[matchId]
    if (cached && cached.expiresAt > Date.now()) return
    // F7 fix — wrap in try/catch + explicit error checks. The decrypt_dob RPC
    // rejects when is_admin() returns false (transient profile race, stale
    // role claim, or non-admin caller). The unhandled promise rejection
    // previously escalated to a global handler that called signOut, kicking
    // the admin out of the dashboard. Swallow the error here so the panel
    // degrades gracefully instead.
    try {
      const [hmResult, talentResult] = await Promise.all([
        hmEnc ? supabase.rpc('decrypt_dob', { encrypted: hmEnc }) : Promise.resolve({ data: null, error: null }),
        talentEnc ? supabase.rpc('decrypt_dob', { encrypted: talentEnc }) : Promise.resolve({ data: null, error: null }),
      ])
      if (hmResult.error || talentResult.error) {
        console.warn('[approvals] decrypt_dob failed', hmResult.error || talentResult.error)
        return
      }
      setDobCache((prev) => ({
        ...prev,
        [matchId]: {
          hm: (hmResult.data as string | null) ?? null,
          talent: (talentResult.data as string | null) ?? null,
          expiresAt: Date.now() + 5 * 60_000,
        },
      }))
    } catch (e) {
      console.warn('[approvals] decryptDobs threw', e)
    }
  }

  function toggleExpand(m: PendingMatch) {
    if (expanded === m.id) {
      setExpanded(null)
    } else {
      setExpanded(m.id)
      void decryptDobs(m.id, m.roles?.hiring_managers?.date_of_birth_encrypted ?? null, m.talents?.date_of_birth_encrypted ?? null)
    }
  }

  async function transition(matchId: string, newStatus: 'generated' | 'expired') {
    setProcessing(matchId)
    const { error } = await supabase.from('matches').update({ status: newStatus }).eq('id', matchId)
    if (error) {
      setErr(error.message)
    } else {
      // If approving, fire the talent notification via the notify function.
      if (newStatus === 'generated') {
        const row = rows.find((r) => r.id === matchId)
        if (row?.talents?.id) {
          const notifyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify`
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
          fetch(notifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
            body: JSON.stringify({
              talent_id: row.talents.id,
              type: 'match_ready',
              data: { compatibility_score: row.compatibility_score },
            }),
          }).catch(() => {/* best effort */})
        }
      }
      await reload()
    }
    setProcessing(null)
  }

  async function approveAll() {
    if (!confirm(`Approve all ${rows.length} pending matches?`)) return
    setLoading(true)
    const ids = rows.map((r) => r.id)
    const { error } = await supabase.from('matches').update({ status: 'generated' }).in('id', ids)
    if (error) setErr(error.message)
    else await reload()
    setLoading(false)
  }

  async function toggleAutopilot() {
    const next = !autopilot
    setAutopilotLoading(true)
    const { error } = await supabase.from('system_config')
      .update({ value: next ? '"autopilot"' : '"manual"' }).eq('key', 'match_approval_mode')
    if (error) { setErr(error.message); setAutopilotLoading(false); return }

    // When switching to autopilot, bulk-approve all currently pending matches.
    if (next && rows.length > 0) {
      const ids = rows.map((r) => r.id)
      await supabase.from('matches').update({ status: 'generated' }).in('id', ids)
    }
    setAutopilot(next)
    setAutopilotLoading(false)
    await reload()
  }

  return (
    <div>
      {/* Autopilot toggle */}
      <div className="flex items-center justify-between mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div>
          <p className="text-sm font-semibold text-amber-900">
            {autopilot ? 'Autopilot mode — matches go live immediately' : 'Manual mode — all matches need your approval'}
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {autopilot
              ? 'Switching to Manual will require your approval for each new match before talent and HM can see it.'
              : 'Switching to Autopilot will auto-approve new matches and release all currently pending matches.'}
          </p>
        </div>
        <button
          onClick={() => void toggleAutopilot()}
          disabled={autopilotLoading}
          className={`ml-4 px-4 py-2 rounded text-sm font-medium transition-colors ${
            autopilot
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {autopilotLoading ? '…' : autopilot ? 'Autopilot ON' : 'Manual mode'}
        </button>
      </div>

      {/* Header row */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-800">
          Pending approval{rows.length > 0 ? ` (${rows.length})` : ''}
        </h2>
        <button onClick={() => void reload()} className="text-xs border px-2 py-1 rounded hover:bg-gray-50">
          Refresh
        </button>
        {rows.length > 1 && (
          <button
            onClick={() => void approveAll()}
            className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
          >
            Approve all
          </button>
        )}
      </div>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      {loading ? <LoadingSpinner /> : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No matches pending approval.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((m) => {
            const dobs = dobCache[m.id]?.expiresAt > Date.now() ? dobCache[m.id] : undefined
            const tags = (m.talents?.derived_tags ?? {}) as Record<string, number>
            const topTagEntries = TOP_TAGS
              .filter((k) => tags[k] != null)
              .sort((a, b) => (tags[b] ?? 0) - (tags[a] ?? 0))
              .slice(0, 5)

            return (
              <div key={m.id} className="bg-white border rounded-lg overflow-hidden">
                {/* Summary row */}
                <div className="flex items-start gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    {/* Role info */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">
                        {m.roles?.title ?? '(role deleted)'}
                      </span>
                      {m.roles?.industry && (
                        <span className="text-xs text-gray-500 border rounded px-1.5 py-0.5">
                          {m.roles.industry}
                        </span>
                      )}
                    </div>
                    {m.roles?.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{m.roles.description}</p>
                    )}

                    {/* Scores row */}
                    <div className="flex gap-4 mt-2 flex-wrap">
                      <ScoreBadge value={m.compatibility_score} label="Overall" />
                      <ScoreBadge value={m.tag_compatibility} label="Skills" />
                      <ScoreBadge value={m.life_chart_score} label="Team-fit" />
                    </div>

                    {/* HM vs Talent profile signal */}
                    <div className="flex gap-6 mt-2 text-xs text-gray-600">
                      <span>
                        HM signal: <strong>{m.roles?.hiring_managers?.life_chart_character ?? '—'}</strong>
                      </span>
                      <span>
                        Talent signal: <strong>{m.talents?.life_chart_character ?? '—'}</strong>
                      </span>
                    </div>

                    {/* Top talent strengths */}
                    {topTagEntries.length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {topTagEntries.map((k) => (
                          <span key={k} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5">
                            {TAG_LABELS[k] ?? k}: {Math.round((tags[k] ?? 0) * 100)}%
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => void transition(m.id, 'generated')}
                      disabled={processing === m.id}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void transition(m.id, 'expired')}
                      disabled={processing === m.id}
                      className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs rounded hover:bg-red-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => toggleExpand(m)}
                      className="px-3 py-1.5 bg-gray-50 text-gray-600 border text-xs rounded hover:bg-gray-100"
                    >
                      {expanded === m.id ? 'Hide' : 'Details'}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded === m.id && (
                  <div className="border-t bg-gray-50 p-4 space-y-3">
                    {/* DOB comparison */}
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="bg-white border rounded p-3">
                        <p className="font-semibold text-gray-700 mb-1">Hiring Manager</p>
                        <p>Signal: <strong>{m.roles?.hiring_managers?.life_chart_character ?? '—'}</strong></p>
                        <p>DOB: {dobs ? (dobs.hm ?? 'not set') : 'Loading…'}</p>
                      </div>
                      <div className="bg-white border rounded p-3">
                        <p className="font-semibold text-gray-700 mb-1">Talent</p>
                        <p>Signal: <strong>{m.talents?.life_chart_character ?? '—'}</strong></p>
                        <p>DOB: {dobs ? (dobs.talent ?? 'not set') : 'Loading…'}</p>
                      </div>
                    </div>

                    {/* All tags */}
                    {Object.keys(tags).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-1.5">All talent strengths</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {Object.entries(tags)
                            .sort(([, a], [, b]) => b - a)
                            .map(([k, v]) => (
                              <span key={k} className="text-xs bg-white border rounded px-1.5 py-0.5 text-gray-700">
                                {TAG_LABELS[k] ?? k}: {Math.round(v * 100)}%
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Internal reasoning */}
                    {m.internal_reasoning && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-1">Scoring breakdown</p>
                        <pre className="text-xs bg-white border rounded p-2 overflow-x-auto max-h-64">
{JSON.stringify(m.internal_reasoning, null, 2)}
                        </pre>
                      </div>
                    )}

                    <p className="text-xs text-gray-400">
                      Generated {new Date(m.created_at).toLocaleString()}
                    </p>
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
