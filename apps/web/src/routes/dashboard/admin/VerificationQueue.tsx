import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface CompanyRow {
  id: string
  name: string
  registration_number: string
  primary_hr_email: string
  business_license_path: string | null
  created_at: string
}

export default function VerificationQueue() {
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('companies')
      .select('id, name, registration_number, primary_hr_email, business_license_path, created_at')
      .eq('verified', false)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setErr(error.message)
        else setRows((data ?? []) as CompanyRow[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function verify(id: string) {
    const { error } = await supabase
      .from('companies')
      .update({ verified: true, verified_at: new Date().toISOString() })
      .eq('id', id)
    if (error) setErr(error.message)
    else setRows((rs) => rs.filter((r) => r.id !== id))
  }

  async function viewLicense(path: string) {
    const { data, error } = await supabase.storage.from('business-licenses').createSignedUrl(path, 60)
    if (error) { setErr(error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  if (loading) return <LoadingSpinner />
  return (
    <div>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">All companies verified.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div key={c.id} className="bg-white border rounded p-4 flex justify-between items-center">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-gray-500">
                  SSM: {c.registration_number} · HR: {c.primary_hr_email}
                </div>
              </div>
              <div className="flex gap-2">
                {c.business_license_path && (
                  <button
                    onClick={() => void viewLicense(c.business_license_path!)}
                    className="border px-3 py-1 rounded text-sm hover:bg-gray-50"
                  >
                    View license
                  </button>
                )}
                <button
                  onClick={() => void verify(c.id)}
                  className="bg-brand-600 text-white px-3 py-1 rounded text-sm hover:bg-brand-700"
                >
                  Verify
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
