import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { listOrgConsultations } from '../../data/repositories/orgConsultations'
import { Badge, Button, EmptyState, PageHeader, type BadgeTone } from '../../components/ui'
import { DataList, type DataListColumn } from '../../ui'
import { Async } from '../../components/patterns/Async'
import ListSkeleton from '../../components/ListSkeleton'
import { useSeo } from '../../lib/useSeo'
import type { OrgConsultationRow } from '../../shared/domain/orgChart/orgChart'

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

const COLUMNS: DataListColumn<OrgConsultationRow>[] = [
  {
    key: 'client_company',
    header: 'Client Company',
    render: (r) => (
      <>
        <div className="font-medium text-ink-900">{r.client_company}</div>
        {r.client_contact_name && (
          <div className="text-xs text-ink-500">{r.client_contact_name}</div>
        )}
      </>
    ),
  },
  {
    key: 'team_size',
    header: 'Team Size',
    render: (r) => <span className="text-ink-700">{r.team_size}</span>,
  },
  {
    key: 'price_myr',
    header: 'Price',
    render: (r) => (
      <span className="font-medium text-ink-900">RM {Number(r.price_myr).toLocaleString()}</span>
    ),
  },
  {
    key: 'payment_status',
    header: 'Payment',
    render: (r) => <Badge tone={PAY_TONE[r.payment_status]}>{PAY_LABEL[r.payment_status]}</Badge>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
  },
  {
    key: 'created_at',
    header: 'Created',
    render: (r) => (
      <span className="text-xs text-ink-500">{new Date(r.created_at).toLocaleDateString()}</span>
    ),
  },
  {
    key: 'actions',
    header: 'Actions',
    className: 'text-right',
    render: (r) => (
      <Link to={`/hm/org-chart/${r.id}`}>
        <Button variant="secondary" size="sm">
          Open
        </Button>
      </Link>
    ),
  },
]

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
          <Button asChild variant="primary">
            <Link to="/hm/org-chart/new">
              + New Consultation
            </Link>
          </Button>
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
              <Button asChild variant="primary">
                <Link to="/hm/org-chart/new">
                  + New Consultation
                </Link>
              </Button>
            }
          />
        }
      >
        {(items) => (
          <DataList
            columns={COLUMNS}
            rows={items}
            rowKey={(r) => r.id}
            caption="Org chart consultations"
          />
        )}
      </Async>
    </div>
  )
}
