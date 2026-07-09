import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { listOrgConsultations } from '../../data/repositories/orgConsultations'
import { Badge, Button, Card, EmptyState, PageHeader, type BadgeTone } from '../../components/ui'
import { Async } from '../../components/patterns/Async'
import ListSkeleton from '../../components/ListSkeleton'
import { useSeo } from '../../lib/useSeo'
import type { OrgConsultationRow } from '../../lib/orgChart'

const STATUS_LABEL: Record<OrgConsultationRow['status'], string> = {
  draft: 'Draft',
  collecting: 'Collecting',
  analyzing: 'Analysing',
  completed: 'Completed',
  delivered: 'Delivered',
}

const STATUS_TONE: Record<OrgConsultationRow['status'], BadgeTone> = {
  draft: 'gray',
  collecting: 'brand',
  analyzing: 'accent',
  completed: 'green',
  delivered: 'green',
}

const PAY_LABEL: Record<OrgConsultationRow['payment_status'], string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  waived: 'Waived',
}

const PAY_TONE: Record<OrgConsultationRow['payment_status'], BadgeTone> = {
  unpaid: 'red',
  paid: 'green',
  waived: 'gray',
}

export default function OrgChartList() {
  useSeo({ title: 'Org Chart Consultant', noindex: true })
  const { session } = useSession(useShallow((s) => ({ session: s.session })))
  const [rows, setRows] = useState<OrgConsultationRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await listOrgConsultations()
      if (cancelled) return
      if (error) {
        setErr(error.message)
        setRows([])
        return
      }
      setRows((data ?? []) as unknown as OrgConsultationRow[])
    }
    if (session?.user.id) void load()
    return () => {
      cancelled = true
    }
  }, [session?.user.id])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Org Chart Consultant"
        description="Corporate team restructure analysis — RM 99 to RM 3,999 per engagement"
        actions={
          <Link to="/hm/org-chart/new" className="btn-primary">
            + New Consultation
          </Link>
        }
      />

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <Async
        data={rows ?? undefined}
        isLoading={rows === null}
        loading={<ListSkeleton rows={4} />}
        empty={
          <EmptyState
            title="No consultations yet"
            description="Start a new consultation to upload a team roster and generate an org-chart restructure report."
            action={
              <Link to="/hm/org-chart/new" className="btn-primary">
                + New Consultation
              </Link>
            }
          />
        }
      >
        {(items) => (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-100 bg-ink-50 text-ink-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Client Company</th>
                    <th className="px-4 py-3 font-medium">Team Size</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-ink-100 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink-900">{r.client_company}</div>
                        {r.client_contact_name && (
                          <div className="text-xs text-ink-500">{r.client_contact_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-700">{r.team_size}</td>
                      <td className="px-4 py-3 font-medium text-ink-900">
                        RM {Number(r.price_myr).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={PAY_TONE[r.payment_status]}>
                          {PAY_LABEL[r.payment_status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-500">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/hm/org-chart/${r.id}`}>
                          <Button variant="secondary" size="sm">
                            Open
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Async>
    </div>
  )
}
