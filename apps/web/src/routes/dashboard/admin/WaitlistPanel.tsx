import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface WaitlistRow {
  id: string
  email: string
  full_name: string | null
  intended_role: string | null
  approved: boolean
  created_at: string
}

export default function WaitlistPanel() {
  const [rows, setRows] = useState<WaitlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('waitlist')
      .select('id, email, full_name, intended_role, approved, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setErr(error.message)
        else setRows((data ?? []) as WaitlistRow[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function approve(id: string) {
    const { error } = await supabase
      .from('waitlist')
      .update({ approved: true, approved_at: new Date().toISOString() })
      .eq('id', id)
    if (error) setErr(error.message)
    else setRows((rs) => rs.map((r) => (r.id === id ? { ...r, approved: true } : r)))
  }

  if (loading) return <LoadingSpinner />
  return (
    <div>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">Waitlist is empty.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2">Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
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
