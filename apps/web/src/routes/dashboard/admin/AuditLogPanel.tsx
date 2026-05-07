import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface AuditRow {
  id: number
  created_at: string
  actor_id: string | null
  actor_role: string | null
  subject_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, unknown>
}

const PAGE_SIZE = 50

const ACTION_GROUPS: Array<{ label: string; actions: string[] }> = [
  { label: 'Auth', actions: ['login', 'logout', 'login_failed', 'session_expired', 'password_changed', 'password_reset_requested', 'mfa_enrolled', 'mfa_challenge_passed', 'mfa_challenge_failed'] },
  { label: 'Account', actions: ['account_created', 'account_soft_deleted', 'account_restored', 'profile_updated'] },
  { label: 'Consent', actions: ['consent_granted', 'consent_revoked', 'consent_renewed'] },
  { label: 'Data subject rights', actions: ['dsr_submitted', 'dsr_completed', 'dsr_export_downloaded'] },
  { label: 'Admin reads', actions: ['admin_profile_view', 'admin_talent_view', 'admin_file_view', 'admin_action'] },
  { label: 'Files', actions: ['file_uploaded', 'file_deleted', 'file_viewed'] },
  { label: 'Matching', actions: ['match_generated', 'match_accepted', 'match_declined', 'match_expired'] },
  { label: 'Compliance', actions: ['breach_detected', 'breach_notified_dpo', 'breach_notified_user'] },
  { label: 'System', actions: ['data_purged', 'cron_run'] },
]

export default function AuditLogPanel() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [actionFilter, setActionFilter] = useState<string>('')
  const [actorSearch, setActorSearch] = useState('')

  async function reload() {
    setLoading(true); setErr(null)
    let q = supabase
      .from('audit_log')
      .select('id, created_at, actor_id, actor_role, subject_id, action, resource_type, resource_id, metadata')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (actionFilter) q = q.eq('action', actionFilter)
    if (actorSearch.trim()) q = q.or(`actor_id.eq.${actorSearch.trim()},subject_id.eq.${actorSearch.trim()}`)
    const { data, error } = await q
    if (error) {
      console.error('[AuditLogPanel] reload failed:', error)
      setErr('Could not load audit log. Check the browser console for details.')
    } else {
      setRows((data ?? []) as AuditRow[])
    }
    setLoading(false)
  }

  // reload also reads actorSearch but we only want to refire on filter/page changes;
  // actorSearch refetch is driven manually by the Search button / Enter key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload() }, [page, actionFilter])

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Append-only platform audit trail. Captures auth, consent, DSR, admin reads, file ops,
        matching, and compliance events. Retained for 730 days (purge job runs monthly).
      </p>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label htmlFor="audit-action" className="block text-xs text-gray-500 mb-1">Action</label>
          <select
            id="audit-action"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0) }}
            className="border rounded px-2 py-1 text-sm min-w-[200px]"
          >
            <option value="">All actions</option>
            {ACTION_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.actions.map((a) => <option key={a} value={a}>{a}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="audit-actor" className="block text-xs text-gray-500 mb-1">
            Actor or subject UUID
          </label>
          <div className="flex gap-1">
            <input
              id="audit-actor"
              type="text"
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(0); void reload() } }}
              placeholder="Paste a user UUID and press Enter"
              className="flex-1 border rounded px-2 py-1 text-sm font-mono"
            />
            <button
              onClick={() => { setPage(0); void reload() }}
              className="text-sm bg-brand-600 text-white px-3 py-1 rounded hover:bg-brand-700"
            >
              Search
            </button>
            {actorSearch && (
              <button
                onClick={() => { setActorSearch(''); setPage(0); void reload() }}
                className="text-sm border px-3 py-1 rounded hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {loading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No events match this view.</p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-2 py-1.5">When (MYT)</th>
                <th className="text-left px-2 py-1.5">Action</th>
                <th className="text-left px-2 py-1.5">Actor</th>
                <th className="text-left px-2 py-1.5">Subject</th>
                <th className="text-left px-2 py-1.5">Resource</th>
                <th className="text-left px-2 py-1.5">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour12: false })}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{r.action}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {r.actor_id ? <span title={r.actor_id}>{r.actor_id.slice(0, 8)}</span> : <span className="text-gray-400">—</span>}
                    {r.actor_role && <span className="ml-1 text-gray-500">({r.actor_role})</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">
                    {r.subject_id ? <span title={r.subject_id}>{r.subject_id.slice(0, 8)}</span> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.resource_type && <span className="text-gray-600">{r.resource_type}</span>}
                    {r.resource_id && <span className="ml-1 font-mono text-gray-500" title={r.resource_id}>{r.resource_id.slice(0, 12)}</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-gray-600 max-w-md truncate" title={JSON.stringify(r.metadata)}>
                    {Object.keys(r.metadata ?? {}).length > 0 ? JSON.stringify(r.metadata) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-center mt-3">
        <span className="text-xs text-gray-500">
          Page {page + 1} · {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="text-sm border px-3 py-1 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            ← Newer
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={rows.length < PAGE_SIZE || loading}
            className="text-sm border px-3 py-1 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            Older →
          </button>
        </div>
      </div>
    </div>
  )
}
