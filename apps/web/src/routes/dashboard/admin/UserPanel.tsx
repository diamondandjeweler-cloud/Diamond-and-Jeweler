import { useEffect, useState } from 'react'
import { adminUserList, updateProfile } from '../../../data/repositories/profiles'
import { callFunction } from '../../../lib/functions'
import ListSkeleton from '../../../components/ListSkeleton'

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

interface ChangeRoleModal { userId: string; currentRole: string; name: string }

const ROLE_OPTIONS = [
  { value: 'talent',          label: 'Talent (job seeker)' },
  { value: 'hiring_manager',  label: 'Hiring Manager' },
  { value: 'hr_admin',        label: 'HR Admin' },
]

export default function UserPanel() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'banned' | 'ghosts'>('all')
  const [q, setQ] = useState('')

  const [changeRoleModal, setChangeRoleModal] = useState<ChangeRoleModal | null>(null)
  const [newRole, setNewRole] = useState('')
  const [roleReason, setRoleReason] = useState('')
  const [roleChanging, setRoleChanging] = useState(false)
  const [roleErr, setRoleErr] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    let query = adminUserList()
    if (filter === 'banned') query = query.eq('is_banned', true)
    if (filter === 'ghosts') query = query.gte('ghost_score', 3)
    if (q.trim()) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
    const { data, error } = await query
    if (error) setErr(error.message)
    else setRows((data ?? []) as UserRow[])
    setLoading(false)
  }
  // q-search is triggered manually via Enter / Refresh; we only auto-refire on filter changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload() }, [filter])

  async function setBan(id: string, is_banned: boolean) {
    setRows((xs) => xs.map((r) => (r.id === id ? { ...r, is_banned } : r)))
    const { error } = await updateProfile(id, { is_banned })
    if (error) setErr(error.message)
  }

  function openChangeRole(u: UserRow) {
    setChangeRoleModal({ userId: u.id, currentRole: u.role, name: u.full_name || u.email })
    setNewRole(u.role)
    setRoleReason('')
    setRoleErr(null)
  }

  async function doChangeRole() {
    if (!changeRoleModal) return
    setRoleChanging(true)
    setRoleErr(null)
    try {
      await callFunction('admin-change-role', {
        user_id: changeRoleModal.userId,
        new_role: newRole,
        reason: roleReason,
      })
      setRows((xs) => xs.map((r) =>
        r.id === changeRoleModal.userId
          ? { ...r, role: newRole, onboarding_complete: false }
          : r
      ))
      setChangeRoleModal(null)
    } catch (e) {
      setRoleErr(e instanceof Error ? e.message : 'Role change failed')
    } finally {
      setRoleChanging(false)
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void reload()}
          placeholder="Search email or name…"
          className="border dark:border-gray-700 rounded px-3 py-1.5 text-sm flex-1"
          aria-label="Search users"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="border dark:border-gray-700 rounded px-2 py-1.5 text-sm"
          aria-label="Filter users"
        >
          <option value="all">All users</option>
          <option value="banned">Banned only</option>
          <option value="ghosts">Ghosting (score ≥ 3)</option>
        </select>
        <button onClick={() => void reload()} className="border dark:border-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300">
          Refresh
        </button>
      </div>
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      {loading ? <ListSkeleton rows={5} variant="row" /> : (
        rows.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No users match.</p> : (
          <table className="w-full text-sm dark:text-gray-300">
            <thead>
              <tr className="text-left text-gray-600 dark:text-gray-400 border-b dark:border-gray-700">
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
                <tr key={u.id} className="border-b dark:border-gray-700 last:border-0 align-top">
                  <td className="py-2">
                    <div className={u.is_banned ? 'line-through text-gray-400 dark:text-gray-500' : 'font-medium'}>
                      {u.full_name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                  </td>
                  <td className="capitalize">{u.role.replace('_', ' ')}</td>
                  <td>{u.onboarding_complete ? '✓' : '—'}</td>
                  <td className={u.ghost_score >= 3 ? 'text-red-600 font-semibold' : ''}>
                    {u.ghost_score}
                  </td>
                  <td className="text-gray-500 dark:text-gray-400 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="text-right whitespace-nowrap space-x-3">
                    <button
                      onClick={() => openChangeRole(u)}
                      className="text-xs text-ink-500 dark:text-gray-400 hover:underline"
                    >
                      Change role
                    </button>
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

      {changeRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-base dark:text-white">Change role — {changeRoleModal.name}</h3>
            <p className="text-xs text-ink-500 dark:text-gray-400">
              Current: <span className="capitalize font-medium">{changeRoleModal.currentRole.replace('_', ' ')}</span>.
              Onboarding will be reset so the user goes through the correct flow.
            </p>
            <div>
              <label htmlFor="admin-new-role" className="block text-sm font-medium text-ink-700 dark:text-gray-300 mb-1">New role</label>
              <select
                id="admin-new-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="admin-role-reason" className="block text-sm font-medium text-ink-700 dark:text-gray-300 mb-1">Reason (required)</label>
              <input
                id="admin-role-reason"
                type="text"
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
                placeholder="e.g. Registered as talent by mistake"
                className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            {roleErr && <p className="text-xs text-red-600">{roleErr}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setChangeRoleModal(null)}
                disabled={roleChanging}
                className="px-4 py-2 text-sm rounded-lg border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => void doChangeRole()}
                disabled={roleChanging || newRole === changeRoleModal.currentRole || roleReason.trim().length < 8}
                className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {roleChanging ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
