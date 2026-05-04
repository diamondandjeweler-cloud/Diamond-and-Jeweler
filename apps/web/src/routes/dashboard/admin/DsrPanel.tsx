import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { callFunction } from '../../../lib/functions'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface CorrectionItem { field: string; new_value: unknown }

interface DsrRow {
  id: string
  user_id: string
  request_type: 'access' | 'correction' | 'deletion' | 'portability'
  status: string
  notes: string | null
  correction_proposal: { items?: CorrectionItem[] } | null
  created_at: string
  resolved_at: string | null
  profiles?: { email: string; full_name: string } | null
}

export default function DsrPanel() {
  const [rows, setRows] = useState<DsrRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [working, setWorking] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    let q = supabase
      .from('data_requests')
      .select('id, user_id, request_type, status, notes, correction_proposal, created_at, resolved_at, profiles!data_requests_user_id_fkey(email, full_name)')
      .order('created_at', { ascending: false })
    if (filter === 'pending') q = q.in('status', ['pending', 'in_review'])
    const { data, error } = await q.limit(100)
    if (error) {
      console.error('[DsrPanel] reload failed:', error)
      setErr('Could not load data requests. Check the browser console for details.')
    } else {
      setRows((data ?? []) as unknown as DsrRow[])
    }
    setLoading(false)
  }

  useEffect(() => { void reload() }, [filter])

  async function setStatus(r: DsrRow, status: 'in_review' | 'completed' | 'rejected') {
    setWorking(r.id); setErr(null)

    const patch: Record<string, unknown> = { status }
    if (status === 'completed' || status === 'rejected') {
      patch.resolved_at = new Date().toISOString()
    }
    const { error } = await supabase.from('data_requests').update(patch).eq('id', r.id)
    if (error) {
      console.error('[DsrPanel] setStatus failed:', error)
      setErr('Could not update this request. Check the browser console for details.')
      setWorking(null); return
    }

    // For access / portability completions, trigger the export Edge Function
    // to compile the user's data and email them a signed-link download.
    if (
      status === 'completed' &&
      (r.request_type === 'access' || r.request_type === 'portability')
    ) {
      try {
        await callFunction('dsr-export', { request_id: r.id })
      } catch (e) {
        setErr(`DSR marked completed, but export failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    setWorking(null)
    await reload()
  }

  async function applyCorrection(r: DsrRow) {
    if (!r.correction_proposal?.items?.length) {
      setErr('No correction proposal on this request.')
      return
    }
    setWorking(r.id); setErr(null)
    try {
      const result = await callFunction<{ applied: unknown[]; rejected: { field: string; reason: string }[] }>(
        'dsr-apply-correction',
        { request_id: r.id },
      )
      if (result.rejected?.length) {
        setErr(
          `Applied ${result.applied.length}, rejected ${result.rejected.length}: ` +
          result.rejected.map((x) => `${x.field} (${x.reason})`).join(', '),
        )
      }
    } catch (e) {
      setErr(`Correction failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setWorking(null)
      await reload()
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">
          PDPA data subject requests. Deletion enforcement runs 30 days after{' '}
          <code>completed</code> via the <code>data-retention</code> cron. Access
          and portability completions fire <code>dsr-export</code> to email the
          user a signed download link.
        </p>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'pending' | 'all')}
          className="border rounded px-2 py-1 text-sm"
          aria-label="Filter DSR requests"
        >
          <option value="pending">Pending only</option>
          <option value="all">All</option>
        </select>
      </div>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No requests in this view.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white border rounded p-3">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <div className="font-medium">{r.profiles?.full_name ?? '—'}</div>
                  <div className="text-xs text-gray-500">
                    {r.profiles?.email ?? r.user_id.slice(0, 8)} ·{' '}
                    <span className="capitalize">{r.request_type}</span> ·{' '}
                    <span className="capitalize">{r.status.replace('_', ' ')}</span> ·{' '}
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                  {r.notes && <div className="text-xs text-gray-600 mt-1">{r.notes}</div>}

                  {r.request_type === 'correction' && r.correction_proposal?.items && (
                    <details className="mt-2">
                      <summary className="text-xs text-brand-600 cursor-pointer hover:underline">
                        {r.correction_proposal.items.length} proposed correction{r.correction_proposal.items.length === 1 ? '' : 's'}
                      </summary>
                      <ul className="mt-2 text-xs bg-gray-50 rounded p-2 space-y-1">
                        {r.correction_proposal.items.map((it, i) => (
                          <li key={i} className="font-mono">
                            <span className="text-gray-500">{it.field}</span>
                            {' → '}
                            <span className="text-gray-900">{JSON.stringify(it.new_value)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="whitespace-nowrap">
                  {working === r.id && <span className="text-xs text-gray-400">Working…</span>}
                  {working !== r.id && (
                    <div className="flex flex-col items-end gap-1">
                      {r.status === 'pending' && (
                        <button
                          onClick={() => void setStatus(r, 'in_review')}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          Mark in review
                        </button>
                      )}
                      {(r.status === 'pending' || r.status === 'in_review') && (
                        <>
                          {r.request_type === 'correction' && r.correction_proposal?.items?.length ? (
                            <button
                              onClick={() => void applyCorrection(r)}
                              className="text-xs bg-brand-600 text-white px-2 py-1 rounded hover:bg-brand-700"
                            >
                              Apply correction
                            </button>
                          ) : (
                            <button
                              onClick={() => void setStatus(r, 'completed')}
                              className="text-xs text-green-700 hover:underline"
                            >
                              Complete
                            </button>
                          )}
                          <button
                            onClick={() => void setStatus(r, 'rejected')}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
