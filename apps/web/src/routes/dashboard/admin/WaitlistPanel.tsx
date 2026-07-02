import { useEffect, useState } from 'react'
import { approveWaitlistEntry, listWaitlist } from '../../../data/repositories/waitlist'
import ListSkeleton from '../../../components/ListSkeleton'

interface WaitlistRow {
  id: string
  email: string
  full_name: string | null
  intended_role: string | null
  approved: boolean
  created_at: string
}

export default function WaitlistPanel() {
  // PII (email + name) — skeleton-on-load, no localStorage persistence.
  const [rows, setRows] = useState<WaitlistRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listWaitlist()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setErr(error.message); setRows([]); return }
        setRows((data ?? []) as WaitlistRow[])
      })
    return () => { cancelled = true }
  }, [])

  async function approve(id: string) {
    const { error } = await approveWaitlistEntry(id)
    if (error) setErr(error.message)
    else setRows((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, approved: true } : r)))
  }

  return (
    <div>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {rows == null ? (
        <ListSkeleton rows={5} variant="row" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">Waitlist is empty.</p>
      ) : (
        <table className="w-full text-sm dark:text-gray-300">
          <thead>
            <tr className="text-left text-gray-600 dark:text-gray-400 border-b dark:border-gray-700">
              <th className="py-2">Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b dark:border-gray-700 last:border-0">
                <td className="py-2">{r.email}</td>
                <td>{r.full_name ?? '—'}</td>
                <td>{r.intended_role ?? '—'}</td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="text-right">
                  {r.approved ? (
                    <span className="text-green-700 text-xs">Approved</span>
                  ) : (
                    <button
                      onClick={() => void approve(r.id)}
                      className="text-brand-600 hover:underline text-xs"
                    >
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
