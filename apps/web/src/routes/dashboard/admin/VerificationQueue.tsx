import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { listUnverifiedCompanies, markCompanyVerified } from '../../../data/repositories/companies'
import ListSkeleton from '../../../components/ListSkeleton'
import { Async } from '../../../components/patterns/Async'
import type { CompanyRow } from '../../../types/db'

export default function VerificationQueue() {
  // PII-bearing list (company HR emails); never cached, just skeleton-on-load.
  const [rows, setRows] = useState<CompanyRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listUnverifiedCompanies().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setErr(error.message)
        setRows([])
        return
      }
      setRows(data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function verify(id: string) {
    const { error } = await markCompanyVerified(id)
    if (error) setErr(error.message)
    else setRows((rs) => (rs ?? []).filter((r) => r.id !== id))
  }

  async function viewLicense(path: string) {
    const { data, error } = await supabase.storage
      .from('business-licenses')
      .createSignedUrl(path, 60)
    if (error) {
      setErr(error.message)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <div>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      <Async
        data={rows ?? undefined}
        isLoading={rows == null}
        loading={<ListSkeleton rows={5} variant="row" />}
        empty={<p className="text-sm text-gray-600 dark:text-gray-300">All companies verified.</p>}
      >
        {(items) => (
          <div className="space-y-2">
            {items.map((c) => (
              <div
                key={c.id}
                className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded p-4 flex justify-between items-center"
              >
                <div>
                  <div className="font-semibold dark:text-white">{c.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Company ID: {c.registration_number} · HR: {c.primary_hr_email}
                  </div>
                </div>
                <div className="flex gap-2">
                  {c.business_license_path && (
                    <button
                      onClick={() => void viewLicense(c.business_license_path!)}
                      className="border dark:border-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
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
      </Async>
    </div>
  )
}
