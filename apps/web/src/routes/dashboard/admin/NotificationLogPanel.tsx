import { useEffect, useState } from 'react'
import { adminNotificationLog } from '../../../data/repositories/notifications'
import { callFunction } from '../../../lib/functions'
import ListSkeleton from '../../../components/ListSkeleton'

interface NotifRow {
  id: string
  user_id: string
  type: string
  channel: string | null
  subject: string | null
  body: string | null
  read: boolean
  sent_at: string
  data: Record<string, unknown> | null
  profiles: { email: string; full_name: string } | null
}

export default function NotificationLogPanel() {
  const [rows, setRows] = useState<NotifRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [channel, setChannel] = useState<'all' | 'email' | 'in_app'>('all')
  const [resending, setResending] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    let q = adminNotificationLog()
    if (channel !== 'all') q = q.eq('channel', channel)
    const { data, error } = await q
    if (error) setErr(error.message)
    else setRows((data ?? []) as unknown as NotifRow[])
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload() }, [channel])

  async function resend(row: NotifRow) {
    setResending(row.id); setErr(null)
    try {
      await callFunction('notify', {
        user_id: row.user_id,
        type: row.type,
        data: row.data ?? {},
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setResending(null)
      await reload()
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 items-center">
        <label htmlFor="notif-channel-filter" className="text-sm text-gray-600 dark:text-gray-300">Channel:</label>
        <select
          id="notif-channel-filter"
          value={channel}
          onChange={(e) => setChannel(e.target.value as typeof channel)}
          className="border dark:border-border rounded px-2 py-1 text-sm"
        >
          <option value="all">All</option>
          <option value="email">Email</option>
          <option value="in_app">In-app</option>
        </select>
        <button onClick={() => void reload()} className="border dark:border-border px-3 py-1 rounded text-sm hover:bg-gray-50 dark:hover:bg-surface dark:text-gray-300">
          Refresh
        </button>
      </div>
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      {loading ? <ListSkeleton rows={5} variant="row" /> : (
        rows.length === 0 ? <p className="text-sm text-fg-muted">No notifications logged.</p> : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="bg-surface border dark:border-border rounded p-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate dark:text-fg">{r.subject ?? `(${r.type})`}</div>
                    <div className="text-xs text-fg-muted">
                      → {r.profiles?.full_name ?? r.user_id.slice(0, 8)}{' '}
                      <span className="text-fg-subtle">({r.profiles?.email ?? '—'})</span>
                      {' · '}
                      <span className="capitalize">{r.type.replace(/_/g, ' ')}</span>
                      {' · '}
                      <span className="capitalize">{r.channel ?? 'unknown'}</span>
                      {' · '}
                      {new Date(r.sent_at).toLocaleString('en-MY', {
                        timeZone: 'Asia/Kuala_Lumpur',
                        dateStyle: 'short', timeStyle: 'short',
                      })}
                      {r.read && <span className="text-green-700"> · read</span>}
                    </div>
                    {r.body && (
                      <div className="text-xs text-fg-muted mt-1 line-clamp-2 whitespace-pre-line">{r.body}</div>
                    )}
                  </div>
                  <button
                    onClick={() => void resend(r)}
                    disabled={resending === r.id}
                    className="text-xs text-brand-600 hover:underline whitespace-nowrap disabled:text-gray-400"
                  >
                    {resending === r.id ? 'Resending…' : 'Resend'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
