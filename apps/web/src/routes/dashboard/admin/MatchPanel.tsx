import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface MatchAdminRow {
  id: string
  status: string
  compatibility_score: number | null
  tag_compatibility: number | null
  life_chart_score: number | null
  internal_reasoning: Record<string, unknown> | null
  created_at: string
  expires_at: string | null
  roles: { title: string } | null
  talents: { id: string; profile_id: string } | null
}

export default function MatchPanel() {
  const [rows, setRows] = useState<MatchAdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    let q = supabase
      .from('matches')
      .select('id, status, compatibility_score, tag_compatibility, life_chart_score, internal_reasoning, created_at, expires_at, roles(title), talents(id, profile_id)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    const { data, error } = await q
    if (error) setErr(error.message)
    else setRows((data ?? []) as unknown as MatchAdminRow[])
    setLoading(false)
  }
  useEffect(() => { void reload() }, [statusFilter])

  async function forceExpire(id: string) {
    if (!confirm('Force-expire this match? Irreversible.')) return
    const { error } = await supabase.from('matches')
      .update({ status: 'expired' }).eq('id', id)
    if (error) setErr(error.message)
    else await reload()
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 items-center">
        <label htmlFor="match-status-filter" className="text-sm text-gray-600">Status:</label>
        <select
          id="match-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="all">All</option>
          <option value="generated">Generated</option>
          <option value="viewed">Viewed</option>
          <option value="accepted_by_talent">Accepted by talent</option>
          <option value="invited_by_manager">Invited by manager</option>
          <option value="hr_scheduling">HR scheduling</option>
          <option value="interview_scheduled">Interview scheduled</option>
          <option value="interview_completed">Interview completed</option>
          <option value="hired">Hired</option>
          <option value="expired">Expired</option>
        </select>
        <button onClick={() => void reload()} className="border px-3 py-1 rounded text-sm hover:bg-gray-50">
          Refresh
        </button>
      </div>
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      {loading ? <LoadingSpinner /> : (
        rows.length === 0 ? <p className="text-sm text-gray-500">No matches in this view.</p> : (
          <div className="space-y-2">
            {rows.map((m) => (
              <div key={m.id} className="bg-white border rounded">
                <div className="flex justify-between items-center p-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{m.roles?.title ?? '(role gone)'}</div>
                    <div className="text-xs text-gray-500">
                      Talent {m.talents?.id.slice(0, 8) ?? '—'} ·{' '}
                      <span className="capitalize">{m.status.replace(/_/g, ' ')}</span> ·{' '}
                      {m.compatibility_score != null ? `${Math.round(m.compatibility_score)}%` : '—'} ·{' '}
                      {new Date(m.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      {expanded === m.id ? 'Hide audit' : 'View audit'}
                    </button>
                    {!['expired', 'hired'].includes(m.status) && (
                      <button
                        onClick={() => void forceExpire(m.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Force-expire
                      </button>
                    )}
                  </div>
                </div>
                {expanded === m.id && (
                  <div className="border-t p-3 bg-gray-50">
                    <div className="grid grid-cols-3 gap-3 text-xs mb-2">
                      <div><span className="text-gray-500">Tag comp:</span> {m.tag_compatibility ?? '—'}</div>
                      <div><span className="text-gray-500">Life chart:</span> {m.life_chart_score ?? '—'}</div>
                      <div><span className="text-gray-500">Expires:</span> {m.expires_at ? new Date(m.expires_at).toLocaleString() : '—'}</div>
                    </div>
                    <pre className="text-xs bg-white border rounded p-2 overflow-x-auto">
{JSON.stringify(m.internal_reasoning, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
