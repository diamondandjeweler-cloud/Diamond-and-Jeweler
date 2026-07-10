import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Skeleton, type SkeletonAvatarSize } from './Skeleton'
import { Button } from '../Button'
import { Card, CardBody, CardHeader } from '../Card'
import { Stat } from '../Stat'

const AVATAR_SIZES: SkeletonAvatarSize[] = ['sm', 'md', 'lg']

const meta: Meta<typeof Skeleton.Text> = {
  component: Skeleton.Text,
  tags: ['autodocs'],
  args: { lines: 3 },
  argTypes: {
    lines: { control: { type: 'number', min: 1, max: 8, step: 1 } },
    className: { control: false },
  },
}
export default meta
type Story = StoryObj<typeof Skeleton.Text>

/** Skeleton.Text playground. The shimmer honours prefers-reduced-motion via the
 *  global rule in index.css; toggle the Storybook theme to verify dark parity
 *  (the `.dnj-skel` gradient flips under `.dark`). */
export const Playground: Story = {
  decorators: [(S) => <div style={{ maxWidth: 360 }}><S /></div>],
}

/** Every line count worth designing for — 1-liners keep the 60% tail width. */
export const Text: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-6">
      {[1, 2, 3, 5].map((lines) => (
        <div key={lines}>
          <div className="mb-1 text-xs text-fg-muted">lines={lines}</div>
          <Skeleton.Text lines={lines} />
        </div>
      ))}
    </div>
  ),
}

/** Same footprint as Card + CardHeader (title, subtitle, right action) + CardBody. */
export const CardShape: Story = {
  render: () => (
    <div className="max-w-md">
      <Skeleton.Card />
    </div>
  ),
}

/** Data-list rows, with and without the leading avatar bone. */
export const Rows: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-2">
      <Skeleton.Row />
      <Skeleton.Row avatar />
      <Skeleton.Row avatar />
    </div>
  ),
}

/** All avatar sizes: sm 32px · md 40px · lg 48px. */
export const Avatars: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      {AVATAR_SIZES.map((size) => (
        <div key={size} className="flex flex-col items-center gap-1">
          <Skeleton.Avatar size={size} />
          <span className="text-xs text-fg-muted">{size}</span>
        </div>
      ))}
    </div>
  ),
}

/** KPI tiles — the elevated Stat shell with label/value/hint bones. */
export const Stats: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton.Stat key={i} />
      ))}
    </div>
  ),
}

/** Realistic in-context example: a dashboard mid-load — KPI row, summary card
 *  and a short data list, exactly where the real Stat/Card/rows will land. */
export const DashboardLoading: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton.Stat key={i} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton.Card />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton.Row key={i} avatar />
          ))}
        </div>
      </div>
    </div>
  ),
}

/** Toggle between skeletons and the real primitives they stand in for — the
 *  container heights match, so the swap causes no layout shift. */
function SwapDemo() {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Button variant="secondary" size="sm" className="self-start" onClick={() => setLoaded((v) => !v)}>
        {loaded ? 'Show skeletons' : 'Show loaded content'}
      </Button>
      <div className="grid grid-cols-2 gap-4">
        {loaded ? (
          <>
            <Stat label="Offers accepted" value="89%" hint="4 pending replies" />
            <Stat tone="brand" label="Active placements" value="32" hint="8 started this week" />
          </>
        ) : (
          <>
            <Skeleton.Stat />
            <Skeleton.Stat />
          </>
        )}
      </div>
      {loaded ? (
        <Card>
          <CardHeader
            title="Hiring pipeline"
            subtitle="Last 30 days"
            right={<Button variant="secondary" size="sm">View</Button>}
          />
          <CardBody>
            <p className="text-sm text-fg-muted">
              Fourteen candidates moved stage this month, with three offers out
              and two starts confirmed. Follow-ups are queued for the five
              profiles that stalled at screening.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Skeleton.Card />
      )}
    </div>
  )
}

export const SwapParity: Story = {
  render: () => <SwapDemo />,
}

/** Caller className wins over the composition defaults (cn/twMerge merges it last). */
export const CustomClassName: Story = {
  render: () => (
    <div className="max-w-md">
      <Skeleton.Card className="rounded-md shadow-none" />
    </div>
  ),
}
