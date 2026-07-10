import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Pagination, type PaginationProps } from './Pagination'

/**
 * Stateful harness: the primitive is fully controlled, so stories wire
 * `onPageChange` back into local state to be clickable. (Changing the `page`
 * control after mount won't re-seed the state — drive it by clicking.)
 * No loading story: the component is stateless/synchronous, so loading UIs
 * belong to the data layer around it.
 */
function Controlled({ page: initialPage, ...rest }: Omit<PaginationProps, 'onPageChange'>) {
  const [page, setPage] = useState(initialPage)
  return <Pagination {...rest} page={page} onPageChange={setPage} />
}

const meta: Meta<typeof Pagination> = {
  component: Pagination,
  tags: ['autodocs'],
  args: { page: 3, pageCount: 10, siblingCount: 1 },
  argTypes: {
    page: { control: { type: 'number', min: 1 } },
    pageCount: { control: { type: 'number', min: 0 } },
    siblingCount: { control: { type: 'number', min: 0 } },
    onPageChange: { control: false },
  },
}
export default meta
type Story = StoryObj<typeof Pagination>

export const Playground: Story = {
  render: (args) => <Controlled {...args} />,
}

/** pageCount within the slot budget — every page renders, no ellipsis. */
export const AllPages: Story = {
  render: () => <Controlled page={1} pageCount={7} />,
}

/** Current near the start — only the right side collapses. */
export const RightEllipsis: Story = {
  render: () => <Controlled page={2} pageCount={12} />,
}

/** Current near the end — only the left side collapses. */
export const LeftEllipsis: Story = {
  render: () => <Controlled page={11} pageCount={12} />,
}

/** Current mid-range — both sides collapse. */
export const BothEllipses: Story = {
  render: () => <Controlled page={6} pageCount={12} />,
}

/** siblingCount widens the window hugging the current page. */
export const SiblingCounts: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((siblingCount) => (
        <div key={siblingCount} className="flex flex-wrap items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-fg-muted">siblingCount={siblingCount}</span>
          <Controlled page={10} pageCount={20} siblingCount={siblingCount} />
        </div>
      ))}
    </div>
  ),
}

/** Bound states: Prev disables on the first page, Next on the last. */
export const DisabledBounds: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Controlled page={1} pageCount={5} />
      <Controlled page={5} pageCount={5} />
    </div>
  ),
}

/** Empty/hidden state: at pageCount <= 1 the component returns null. */
export const SinglePage: Story = {
  render: () => (
    <div className="text-sm text-fg-muted">
      Nothing renders after this sentence (pageCount = 1):
      <Pagination page={1} pageCount={1} onPageChange={() => {}} />
    </div>
  ),
}

/** Caller className wins over the shell layout (cn/twMerge merges it last). */
export const CustomClassName: Story = {
  render: () => (
    <Controlled
      page={3}
      pageCount={10}
      className="justify-center rounded-xl2 border border-border bg-surface p-2 shadow-soft"
    />
  ),
}

const LISTINGS = [
  'Aurora Residences', 'Birchwood Court', 'Cedar Grove Villas', 'Damansara Heights Lot 12',
  'Emerald Bay Suites', 'Fraser Ridge Homes', 'Gardenia Terrace', 'Harborview Lofts',
  'Ivory Palms', 'Juniper Walk', 'Kenanga Towers', 'Lakeside Meadows',
  'Maple Crest', 'Nutmeg Gardens', 'Orchid Point', 'Pinnacle One',
  'Quartz Residency', 'Rosewood Enclave', 'Saffron Hills', 'Teakwood Parc',
  'Ultima Vista', 'Verdant Row', 'Willow Springs',
]

function ListingsPager() {
  const pageSize = 5
  const [page, setPage] = useState(1)
  const pageCount = Math.ceil(LISTINGS.length / pageSize)
  const start = (page - 1) * pageSize
  const rows = LISTINGS.slice(start, start + pageSize)
  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl2 border border-border bg-surface shadow-card">
      <ul className="divide-y divide-border">
        {rows.map((name) => (
          <li key={name} className="px-4 py-3 text-sm text-fg">{name}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2 px-4 py-3">
        <p className="text-xs text-fg-muted">
          Showing {start + 1}–{Math.min(start + pageSize, LISTINGS.length)} of {LISTINGS.length}
        </p>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
      </div>
    </div>
  )
}

/** Realistic usage: paging a 23-row dataset (5 per page) with a range readout. */
export const InContext: Story = {
  render: () => <ListingsPager />,
}
