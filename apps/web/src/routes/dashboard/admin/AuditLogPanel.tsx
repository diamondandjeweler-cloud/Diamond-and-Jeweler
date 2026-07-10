import { useState } from 'react'
import { getAdminAuditLog } from '../../../data/repositories/admin'
import ListSkeleton from '../../../components/ListSkeleton'
import { formatError } from '../../../lib/errors'
import { useQuery } from '../../../lib/useQuery'

// F14 — switched from a direct PostgREST select on `audit_log` to a
// SECURITY DEFINER RPC `get_admin_audit_log`. The audit_log RLS policies
// (audit_log_select_admin / audit_log_select_own) both return 0 rows
// when PostgREST treats the request as anon (auth-context drop observed
// elsewhere — see F8 / 0104). The RPC bypasses RLS, gates on is_admin()
// in the body, and supports the same filters the panel exposes.
// See migrations/0105_admin_audit_log_rpc.sql.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

async function fetchAuditLog(
  actionFilter: string,
  committedSearch: string,
  page: number,
): Promise<AuditRow[]> {
  const trimmed = committedSearch.trim()
  // The RPC accepts uuid params — only forward a value when the input is
  // a well-formed UUID; ignore otherwise so partial typing doesn't 400.
  const uuidValue = trimmed && UUID_RE.test(trimmed) ? trimmed : null
  const { data, error } = await getAdminAuditLog({
    p_action:     actionFilter || null,
    // The original UI did an OR on actor_id/subject_id with one input;
    // RPC takes both — we pass the same UUID to both, then dedupe.
    p_actor_id:   uuidValue,
    p_subject_id: uuidValue,
    p_page:       page,
    p_page_size:  PAGE_SIZE,
  })
  if (error) throw error
  // Dedupe by id (the OR filter could return the same row from both
  // p_actor_id and p_subject_id branches if a user is both).
  const seen = new Set<number>()
  return ((data ?? []) as AuditRow[]).filter((r) => {
    if (seen.has(r.id)) return false
    seen.add(r.id); return true
  })
}

export default function AuditLogPanel() {
  const [page, setPage] = useState(0)
  const [actionFilter, setActionFilter] = useState<string>('')
  // `actorSearch` is the live input; `committedSearch` is the value actually
  // sent to the RPC. The original UI refetched on page/filter changes via
  // useEffect, but only refetched on the actor input when the Search button /
  // Enter / Clear was pressed. We model that by keying the query on the
  // *committed* search — typing in the box no longer triggers a fetch; the
  // commit handlers below bump `committedSearch` (and the SWR key) instead.
  const [actorSearch, setActorSearch] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')

  // SWR seam: keyed by the params that define the result. Changing any of
  // page / actionFilter / committedSearch refetches; identical keys dedupe.
  const { data, error: rawErr, isValidating } = useQuery<AuditRow[]>(
    ['admin-audit-log', actionFilter, committedSearch, page],
    () => fetchAuditLog(actionFilter, committedSearch, page),
  )
  if (rawErr) console.error('[AuditLogPanel] reload failed:', rawErr)
  const rows = data ?? []
  const err = rawErr ? formatError(rawErr) : null
  // Preserve the original UX exactly: the old reload() flipped `loading` true
  // on EVERY fetch (initial load, page change, filter change, search), so the
  // skeleton showed each time. `isValidating` is true on every in-flight fetch
  // (initial + revalidation), so we mirror that here rather than `isLoading`
  // (which is only the first load and would let keepPreviousData show stale
  // rows across page changes).
  const loading = isValidating

  // Commit the current actor input as the searched value (resets to page 0).
  // Re-committing the same value still fires because we reset the page; if both
  // are unchanged SWR dedupes to the cached result — same data the user sees.
  const commitSearch = (value: string) => { setCommittedSearch(value); setPage(0) }

  return (
    <div>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
        Append-only platform audit trail. Captures auth, consent, DSR, admin reads, file ops,
        matching, and compliance events. Retained for 730 days (purge job runs monthly).
      </p>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label htmlFor="audit-action" className="block text-xs text-fg-muted mb-1">Action</label>
          <select
            id="audit-action"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0) }}
            className="border dark:border-border rounded px-2 py-1 text-sm min-w-[200px]"
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
          <label htmlFor="audit-actor" className="block text-xs text-fg-muted mb-1">
            Actor or subject UUID
          </label>
          <div className="flex gap-1">
            <input
              id="audit-actor"
              type="text"
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSearch(actorSearch) }}
              placeholder="Paste a user UUID and press Enter"
              className="flex-1 border dark:border-border rounded px-2 py-1 text-sm font-mono"
            />
            <button
              onClick={() => commitSearch(actorSearch)}
              className="text-sm bg-brand-600 text-white px-3 py-1 rounded hover:bg-brand-700"
            >
              Search
            </button>
            {actorSearch && (
              <button
                onClick={() => { setActorSearch(''); commitSearch('') }}
                className="text-sm border dark:border-border px-3 py-1 rounded hover:bg-gray-50 dark:hover:bg-surface dark:text-gray-300"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {loading ? (
        <ListSkeleton rows={5} variant="row" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">No events match this view.</p>
      ) : (
        <div className="overflow-x-auto border dark:border-border rounded">
          <table className="w-full text-xs dark:text-gray-300">
            <thead className="bg-gray-50 dark:bg-surface text-fg-muted">
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
                <tr key={r.id} className="border-t dark:border-border hover:bg-gray-50 dark:hover:bg-surface">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour12: false })}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{r.action}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {r.actor_id ? <span title={r.actor_id}>{r.actor_id.slice(0, 8)}</span> : <span className="text-fg-subtle">—</span>}
                    {r.actor_role && <span className="ml-1 text-fg-muted">({r.actor_role})</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">
                    {r.subject_id ? <span title={r.subject_id}>{r.subject_id.slice(0, 8)}</span> : <span className="text-fg-subtle">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.resource_type && <span className="text-fg-muted">{r.resource_type}</span>}
                    {r.resource_id && <span className="ml-1 font-mono text-fg-muted" title={r.resource_id}>{r.resource_id.slice(0, 12)}</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-fg-muted max-w-md truncate" title={JSON.stringify(r.metadata)}>
                    {Object.keys(r.metadata ?? {}).length > 0 ? JSON.stringify(r.metadata) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-center mt-3">
        <span className="text-xs text-fg-muted">
          Page {page + 1} · {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="text-sm border dark:border-border px-3 py-1 rounded hover:bg-gray-50 dark:hover:bg-surface dark:text-gray-300 disabled:opacity-40"
          >
            ← Newer
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={rows.length < PAGE_SIZE || loading}
            className="text-sm border dark:border-border px-3 py-1 rounded hover:bg-gray-50 dark:hover:bg-surface dark:text-gray-300 disabled:opacity-40"
          >
            Older →
          </button>
        </div>
      </div>
    </div>
  )
}
