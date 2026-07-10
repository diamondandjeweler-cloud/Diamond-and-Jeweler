import { useEffect, useState } from 'react'
import { approveWaitlistEntry, listWaitlist } from '../../../data/repositories/waitlist'
import ListSkeleton from '../../../components/ListSkeleton'
import { Async } from '../../../components/patterns/Async'
import { DataList, type DataListColumn } from '../../../ui'

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
    listWaitlist().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setErr(error.message)
        setRows([])
        return
      }
      setRows((data ?? []) as WaitlistRow[])
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function approve(id: string) {
    const { error } = await approveWaitlistEntry(id)
    if (error) setErr(error.message)
    else setRows((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, approved: true } : r)))
  }

  const columns: DataListColumn<WaitlistRow>[] = [
    { key: 'email', header: 'Email' },
    { key: 'full_name', header: 'Name', render: (r) => r.full_name ?? '—' },
    { key: 'intended_role', header: 'Role', render: (r) => r.intended_role ?? '—' },
    {
      key: 'created_at',
      header: 'Submitted',
      render: (r) => new Date(r.created_at).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (r) =>
        r.approved ? (
          <span className="text-green-700 text-xs">Approved</span>
        ) : (
          <button
            onClick={() => void approve(r.id)}
            className="text-brand-600 hover:underline text-xs"
          >
            Approve
          </button>
        ),
    },
  ]

  return (
    <div>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      <Async
        data={rows ?? undefined}
        isLoading={rows == null}
        loading={<ListSkeleton rows={5} variant="row" />}
        empty={<p className="text-sm text-gray-600 dark:text-fg-strong">Waitlist is empty.</p>}
      >
        {(items) => (
          <DataList
            columns={columns}
            rows={items}
            rowKey={(r) => r.id}
            caption="Waitlist entries"
          />
        )}
      </Async>
    </div>
  )
}
