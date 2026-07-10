import type { Meta, StoryObj } from '@storybook/react'
import { Stat } from './Stat'

/** Decorative sample icon — consumers pass aria-hidden SVGs, per app convention. */
function CoinsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

const meta: Meta<typeof Stat> = {
  title: 'UI/Stat',
  component: Stat,
  tags: ['autodocs'],
  args: {
    label: 'Total revenue',
    value: 'RM 128,400',
    hint: '+12% vs last month',
  },
  argTypes: {
    tone: {
      control: 'select',
      options: ['default', 'brand', 'accent', 'success', 'danger'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Stat>

/* ---- Tones (every variant) ---- */

export const Default: Story = {}

export const Brand: Story = {
  args: { tone: 'brand', label: 'Active placements', value: '32' },
}

export const Accent: Story = {
  args: { tone: 'accent', label: 'Gold-tier talents', value: '117' },
}

export const Success: Story = {
  args: { tone: 'success', label: 'Offers accepted', value: '89%', hint: '4 pending replies' },
}

export const Danger: Story = {
  args: { tone: 'danger', label: 'Overdue follow-ups', value: '7', hint: 'Oldest: 12 days' },
}

/* ---- Notable states ---- */

export const WithIcon: Story = {
  args: { icon: <CoinsIcon /> },
}

export const ValueOnly: Story = {
  name: 'Without hint',
  args: { label: 'Open roles', value: '14', hint: undefined },
}

export const RichValue: Story = {
  name: 'ReactNode value + hint',
  args: {
    label: 'Conversion',
    value: (
      <>
        4.6<span className="text-base text-fg-subtle">%</span>
      </>
    ),
    hint: <span className="text-emerald-700">↑ 0.8 pt week-on-week</span>,
  },
}

export const LongContent: Story = {
  name: 'Long label / value (overflow clip)',
  args: {
    label: 'Cumulative gross merchandise value since launch',
    value: 'RM 1,540,000.00',
    hint: 'Includes POS, online catalogue and manual back-fills across all outlets',
  },
  decorators: [(S) => <div style={{ maxWidth: 260 }}><S /></div>],
}

/** Typical dashboard usage: a responsive grid of tiles, one per tone. */
export const DashboardGrid: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label="Total revenue" value="RM 128,400" hint="+12% vs last month" icon={<CoinsIcon />} />
      <Stat tone="brand" label="Active placements" value="32" hint="8 started this week" />
      <Stat tone="accent" label="Gold-tier talents" value="117" hint="Top 5% of pool" />
      <Stat tone="success" label="Offers accepted" value="89%" hint="4 pending replies" />
      <Stat tone="danger" label="Overdue follow-ups" value="7" hint="Oldest: 12 days" />
    </div>
  ),
}
