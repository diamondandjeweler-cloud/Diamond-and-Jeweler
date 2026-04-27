import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface UserRow {
  id: string
  email: string
  full_name: string
  role: string
  is_banned: boolean
  onboarding_complete: boolean
  ghost_score: number
  created_at: string
}

export default function UserPanel() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'banned' | 'ghosts'>('all')
  const [q, setQ] = useState('')

  async function reload() {
    setLoading(true)
    let query = supabase
      .from('profiles')
      .select('id, email, full_name, role, is_banned, onboarding_complete, ghost_score, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (filter === 'banned') query = query.eq('is_banned', true)
    if (filter === 'ghosts') query = query.gte('ghost_score', 3)
    if (q.trim()) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
    const { data, error } = await query
    if (error) setErr(error.message)
    else setRows((data ?? []) as UserRow[])
    setLoading(false)
  }
  useEffect(() => { void reload() }, [filter])

  async function setBan(id: string, is_banned: boolean) {
    setRows((xs) => xs.map((r) => (r.id === id ? { ...r, is_banned } : r)))
    const { error } = await supabase.from('profiles').update({ is_banned }).eq('id', id)
    if (error) setErr(error.message)
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void reload()}
          placeholder="Search email or name…"
          className="border rounded px-3 py-1.5 text-sm flex-1"
          aria-label="Search users"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="border rounded px-2 py-1.5 text-sm"
          aria-label="Filter users"
        >
          <option value="all">All users</option>
          <option value="banned">Banned only</option>
          <option value="ghosts">Ghosting (score ≥ 3)</option>
        </select>
        <button onClick={() => void reload()} className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50">
          Refresh
        </button>
      </div>
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      {loading ? <LoadingSpinner /> : (
        rows.length === 0 ? <p className="text-sm text-gray-500">No users match.</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2">Name / email</th>
                <th>Role</th>
                <th>Onboarded</th>
                <th>Ghost</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b last:border-0 align-top">
                  <td className="py-2">
                    <div className={u.is_banned ? 'line-through text-gray-400' : 'font-medium'}>
                      {u.full_name}
                    </div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="capitalize">{u.role.replace('_', ' ')}</td>
                  <td>{u.onboarding_complete ? '✓' : '—'}</td>
                  <td className={u.ghost_score >= 3 ? 'text-red-600 font-semibold' : ''}>
                    {u.ghost_score}
                  </td>
                  <td className="text-gray-500 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {u.is_banned ? (
                      <button
                        onClick={() => void setBan(u.id, false)}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => void setBan(u.id, true)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Ban
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}
