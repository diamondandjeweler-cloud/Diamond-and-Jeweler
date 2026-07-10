import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Tabs, type TabsProps, type TabsVariant } from './Tabs'
import { Badge } from '../Badge'

const VARIANTS: TabsVariant[] = ['underline', 'pill']

/** Three-tab scaffold reused across stories. */
function DemoTabs(props: TabsProps) {
  return (
    <Tabs defaultValue="overview" {...props}>
      <Tabs.List aria-label="Demo sections">
        <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
        <Tabs.Trigger value="listings">Listings</Tabs.Trigger>
        <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Panel value="overview" className="pt-4 text-sm text-fg-muted">
        Overview panel — arrow keys move between tabs, Home/End jump to the ends.
      </Tabs.Panel>
      <Tabs.Panel value="listings" className="pt-4 text-sm text-fg-muted">
        Listings panel content.
      </Tabs.Panel>
      <Tabs.Panel value="settings" className="pt-4 text-sm text-fg-muted">
        Settings panel content.
      </Tabs.Panel>
    </Tabs>
  )
}

const meta: Meta<typeof Tabs> = {
  component: Tabs,
  tags: ['autodocs'],
  args: { variant: 'underline' },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    value: { control: false },
    defaultValue: { control: false },
    onValueChange: { control: false },
    orientation: { control: false },
    dir: { control: false },
    activationMode: { control: false },
    asChild: { control: false },
  },
  render: (args) => <DemoTabs {...args} />,
}
export default meta
type Story = StoryObj<typeof Tabs>

export const Playground: Story = {}

/** Both variants side by side. Toggle the Storybook theme to verify dark parity
 *  (underline active flips to brand-400; pill active flips to the raised
 *  surface-2 neutral — matching the legacy .dark overrides). */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-10">
      {VARIANTS.map((variant) => (
        <DemoTabs key={variant} variant={variant} />
      ))}
    </div>
  ),
}

/** The pill rail — active tab gets the inverse ink-900 fill in light. */
export const Pill: Story = {
  args: { variant: 'pill' },
}

/** Disabled triggers dim to 50% and are skipped by Radix's arrow-key roving
 *  focus, in both variants. */
export const DisabledTrigger: Story = {
  render: () => (
    <div className="flex flex-col gap-10">
      {VARIANTS.map((variant) => (
        <Tabs key={variant} variant={variant} defaultValue="active">
          <Tabs.List aria-label={`Disabled example (${variant})`}>
            <Tabs.Trigger value="active">Active</Tabs.Trigger>
            <Tabs.Trigger value="disabled" disabled>Disabled</Tabs.Trigger>
            <Tabs.Trigger value="enabled">Enabled</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="active" className="pt-4 text-sm text-fg-muted">
            Arrow-right lands on “Enabled”, skipping the disabled tab.
          </Tabs.Panel>
          <Tabs.Panel value="enabled" className="pt-4 text-sm text-fg-muted">
            Enabled panel content.
          </Tabs.Panel>
        </Tabs>
      ))}
    </div>
  ),
}

const MANY_TABS = [
  'Overview', 'Listings', 'Applications', 'Interviews', 'Offers',
  'Members', 'Payouts', 'Billing', 'Audit log', 'Settings',
]

/** The List scrolls horizontally when triggers overflow their container, like
 *  the legacy .tabstrip (container constrained to max-w-sm here). */
export const OverflowScroll: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-10">
      {VARIANTS.map((variant) => (
        <Tabs key={variant} variant={variant} defaultValue={MANY_TABS[0]}>
          <Tabs.List aria-label={`Overflow example (${variant})`}>
            {MANY_TABS.map((tab) => (
              <Tabs.Trigger key={tab} value={tab}>{tab}</Tabs.Trigger>
            ))}
          </Tabs.List>
          {MANY_TABS.map((tab) => (
            <Tabs.Panel key={tab} value={tab} className="pt-4 text-sm text-fg-muted">
              {tab} panel.
            </Tabs.Panel>
          ))}
        </Tabs>
      ))}
    </div>
  ),
}

function ControlledExample() {
  const [tab, setTab] = useState('inbox')
  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List aria-label="Controlled example">
          <Tabs.Trigger value="inbox">Inbox</Tabs.Trigger>
          <Tabs.Trigger value="sent">Sent</Tabs.Trigger>
          <Tabs.Trigger value="archive">Archive</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Panel value="inbox" className="pt-4 text-sm text-fg-muted">Inbox panel.</Tabs.Panel>
        <Tabs.Panel value="sent" className="pt-4 text-sm text-fg-muted">Sent panel.</Tabs.Panel>
        <Tabs.Panel value="archive" className="pt-4 text-sm text-fg-muted">Archive panel.</Tabs.Panel>
      </Tabs>
      <p className="text-xs text-fg-subtle">
        External state: <code className="text-fg">{tab}</code>
      </p>
    </div>
  )
}

/** Controlled usage — `value` + `onValueChange` lift the active tab into
 *  caller state (e.g. to sync with the URL). */
export const Controlled: Story = {
  render: () => <ControlledExample />,
}

/** Realistic admin-console usage: badge counts in triggers, a data panel, an
 *  empty-state panel and a loading (skeleton) panel. */
export const InContext: Story = {
  render: () => (
    <Tabs defaultValue="applications" className="max-w-xl">
      <Tabs.List aria-label="Hiring pipeline">
        <Tabs.Trigger value="applications">
          Applications <Badge tone="brand" className="ml-1.5">12</Badge>
        </Tabs.Trigger>
        <Tabs.Trigger value="flagged">
          Flagged <Badge className="ml-1.5">0</Badge>
        </Tabs.Trigger>
        <Tabs.Trigger value="payouts">Payouts</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Panel value="applications" className="pt-4">
        <ul className="divide-y divide-border rounded-xl2 border border-border bg-surface shadow-soft">
          {[
            { name: 'Amirah Zulkifli', role: 'Sommelier', status: 'Interview' },
            { name: 'Jason Lim', role: 'Head Chef', status: 'New' },
            { name: 'Priya Nair', role: 'Floor Manager', status: 'Offer' },
          ].map((row) => (
            <li key={row.name} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-fg">{row.name}</p>
                <p className="text-xs text-fg-muted">{row.role}</p>
              </div>
              <Badge tone={row.status === 'Offer' ? 'green' : row.status === 'New' ? 'brand' : 'amber'} dot>
                {row.status}
              </Badge>
            </li>
          ))}
        </ul>
      </Tabs.Panel>

      <Tabs.Panel value="flagged" className="pt-4">
        <div className="rounded-xl2 border border-border bg-surface-2 px-6 py-10 text-center">
          <p className="text-sm font-medium text-fg">Nothing flagged</p>
          <p className="mt-1 text-xs text-fg-muted">Reports appear here when reviewers flag an application.</p>
        </div>
      </Tabs.Panel>

      <Tabs.Panel value="payouts" className="pt-4">
        <div className="flex flex-col gap-2" role="status" aria-label="Loading payouts">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      </Tabs.Panel>
    </Tabs>
  ),
}

/** Caller className wins over variant defaults (cn/twMerge merges it last) —
 *  here the pill rail is stretched full-width with centred items. */
export const CustomClassName: Story = {
  render: () => (
    <Tabs variant="pill" defaultValue="day">
      <Tabs.List aria-label="Range" className="flex w-full justify-center">
        <Tabs.Trigger value="day">Day</Tabs.Trigger>
        <Tabs.Trigger value="week">Week</Tabs.Trigger>
        <Tabs.Trigger value="month">Month</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Panel value="day" className="pt-4 text-sm text-fg-muted">Day range.</Tabs.Panel>
      <Tabs.Panel value="week" className="pt-4 text-sm text-fg-muted">Week range.</Tabs.Panel>
      <Tabs.Panel value="month" className="pt-4 text-sm text-fg-muted">Month range.</Tabs.Panel>
    </Tabs>
  ),
}
