import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { DataList, type DataListColumn } from './DataList'
import { Badge, type BadgeTone } from '../Badge'
import { Button } from '../Button'
import { Card, CardHeader } from '../Card'

/** Sample domain rows — talent applications on open jeweler roles. */
interface Application {
  id: string
  name: string
  role: string
  status: 'active' | 'pending' | 'rejected'
  match: number
  applied: string
}

const applications: Application[] = [
  { id: 'a1', name: 'Mei Lin Tan', role: 'Senior Goldsmith', status: 'active', match: 92, applied: '2 Jul 2026' },
  { id: 'a2', name: 'Hafiz Rahman', role: 'Gem Setter', status: 'pending', match: 81, applied: '30 Jun 2026' },
  { id: 'a3', name: 'Priya Nair', role: 'CAD Designer', status: 'active', match: 77, applied: '28 Jun 2026' },
  { id: 'a4', name: 'Jason Wong', role: 'Sales Consultant', status: 'rejected', match: 54, applied: '24 Jun 2026' },
  { id: 'a5', name: 'Aisyah Kamal', role: 'Senior Goldsmith', status: 'pending', match: 88, applied: '21 Jun 2026' },
]

const STATUS_TONE: Record<Application['status'], BadgeTone> = {
  active: 'green',
  pending: 'amber',
  rejected: 'red',
}

const columns: DataListColumn<Application>[] = [
  { key: 'name', header: 'Candidate' },
  { key: 'role', header: 'Role', hideBelow: 'sm' },
  {
    key: 'status',
    header: 'Status',
    render: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge>,
  },
  { key: 'match', header: 'Match', className: 'text-right', render: (r) => `${r.match}%` },
  { key: 'applied', header: 'Applied', hideBelow: 'md' },
]

const meta: Meta<typeof DataList> = {
  component: DataList,
  tags: ['autodocs'],
  argTypes: {
    columns: { control: false },
    rows: { control: false },
    rowKey: { control: false },
    onRowClick: { control: false },
    empty: { control: false },
    loading: { control: false },
    caption: { control: 'text' },
  },
}
export default meta
type Story = StoryObj<typeof DataList>

/** Semantic table at md+, stacked cards below — resize the canvas across
 *  768px to watch the presentation switch. Columns without `render` read the
 *  row property named by `key`. */
export const Playground: Story = {
  render: () => (
    <DataList
      columns={columns}
      rows={applications}
      rowKey={(r) => r.id}
      caption="Talent applications"
    />
  ),
}

/** `onRowClick` makes rows/cards focusable (tabIndex=0) and activatable by
 *  click or Enter/Space — Tab to a row and press Enter to try it. Focus is
 *  shown by the global :focus-visible outline. Clicks/keys on interactive
 *  children (links, buttons, inputs in a cell) never double-fire the row —
 *  see InContext for a per-row action button alongside row activation. */
export const ClickableRows: Story = {
  render: function ClickableDemo() {
    const [last, setLast] = useState<string | null>(null)
    return (
      <div className="flex flex-col gap-3">
        <DataList
          columns={columns}
          rows={applications}
          rowKey={(r) => r.id}
          caption="Talent applications"
          onRowClick={(r) => setLast(r.name)}
        />
        <p className="text-sm text-fg-muted" role="status">
          Last activated: <span className="font-medium text-fg">{last ?? '—'}</span>
        </p>
      </div>
    )
  },
}

/** The `empty` slot renders when `rows` is empty (and nothing when omitted —
 *  with <Async> the empty branch usually lives outside DataList instead). */
export const Empty: Story = {
  render: () => (
    <DataList
      columns={columns}
      rows={[] as Application[]}
      rowKey={(r) => r.id}
      caption="Talent applications"
      empty={
        <div className="rounded-xl2 border border-dashed border-border-strong p-8 text-center">
          <p className="font-medium text-fg">No applications yet</p>
          <p className="mt-1 text-sm text-fg-muted">New candidates appear here as they apply.</p>
        </div>
      }
    />
  ),
}

/** The `loading` slot renders in place of the list while truthy — pass your
 *  skeleton through it (`loading={isLoading && <ListSkeleton />}`), or wrap
 *  the whole list in <Async> and let it own the lifecycle. */
export const Loading: Story = {
  render: () => (
    <DataList
      columns={columns}
      rows={[] as Application[]}
      rowKey={(r) => r.id}
      caption="Talent applications"
      loading={
        <div className="flex flex-col gap-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      }
    />
  ),
}

/** `hideBelow` shapes the mobile cards: 'sm' (Role) hides the pair only on
 *  the narrowest screens; 'md' (Applied) makes the column table-only. The
 *  table (md+) always shows every column. Resize the canvas to verify. */
export const ResponsiveColumns: Story = {
  render: () => (
    <DataList
      columns={columns}
      rows={applications.slice(0, 3)}
      rowKey={(r) => r.id}
      caption="Talent applications"
    />
  ),
}

/** The below-md presentation: one bg-surface / rounded-xl2 card per row,
 *  each a <dl> of header/value pairs. */
export const MobileCards: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => (
    <DataList
      columns={columns}
      rows={applications}
      rowKey={(r) => r.id}
      caption="Talent applications"
      onRowClick={() => {}}
    />
  ),
}

/** Realistic composition: DataList inside a Card, clickable rows plus a
 *  per-row action button — the row's activation guard ignores clicks/keys on
 *  the inner Button, so both actions stay independent without any
 *  stopPropagation at the call site. */
export const InContext: Story = {
  render: function InContextDemo() {
    const [log, setLog] = useState('Click a row, or a Shortlist button.')
    const withActions: DataListColumn<Application>[] = [
      ...columns,
      {
        key: 'actions',
        header: 'Actions',
        className: 'text-right',
        render: (r) => (
          <Button size="sm" variant="ghost" onClick={() => setLog(`Shortlisted ${r.name}`)}>
            Shortlist
          </Button>
        ),
      },
    ]
    return (
      <Card className="max-w-3xl">
        <CardHeader
          eyebrow="Hiring"
          title="Talent applications"
          subtitle="Candidates matched to your open roles this week."
          right={<Button size="sm" variant="secondary">Export</Button>}
        />
        <div className="px-6 pb-4">
          <DataList
            columns={withActions}
            rows={applications}
            rowKey={(r) => r.id}
            caption="Talent applications"
            onRowClick={(r) => setLog(`Opened ${r.name}`)}
          />
        </div>
        <p className="px-6 pb-6 text-sm text-fg-muted" role="status">{log}</p>
      </Card>
    )
  },
}

/** Caller className wins over the root defaults (cn/twMerge merges it last);
 *  column className flows to both the table cells and the card values. */
export const CustomClassName: Story = {
  render: () => (
    <DataList
      className="max-w-xl"
      columns={columns}
      rows={applications.slice(0, 3)}
      rowKey={(r) => r.id}
      caption="Talent applications"
    />
  ),
}
