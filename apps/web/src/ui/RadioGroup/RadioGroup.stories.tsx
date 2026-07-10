import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { RadioGroup } from './RadioGroup'

const meta: Meta<typeof RadioGroup> = {
  component: RadioGroup,
  tags: ['autodocs'],
  args: { label: 'Notification method', defaultValue: 'email', disabled: false },
  argTypes: {
    label: { control: 'text' },
    defaultValue: { control: 'select', options: ['email', 'sms', 'whatsapp'] },
    disabled: { control: 'boolean' },
    value: { control: false },
    onValueChange: { control: false },
    asChild: { control: false },
  },
  render: (args) => (
    <RadioGroup {...args}>
      <RadioGroup.Item value="email" label="Email" />
      <RadioGroup.Item value="sms" label="SMS" />
      <RadioGroup.Item value="whatsapp" label="WhatsApp" />
    </RadioGroup>
  ),
}
export default meta
type Story = StoryObj<typeof RadioGroup>

export const Playground: Story = {}

/** Item descriptions are announced via aria-describedby — they never pollute
 *  the radio's accessible name. Wider gap via className for breathing room. */
export const WithDescriptions: Story = {
  render: () => (
    <RadioGroup label="Candidate updates" defaultValue="daily" className="gap-4">
      <RadioGroup.Item value="realtime" label="Real-time" description="Ping me the moment a candidate replies." />
      <RadioGroup.Item value="daily" label="Daily digest" description="One summary email every morning." />
      <RadioGroup.Item value="off" label="Off" description="I will check the dashboard myself." />
    </RadioGroup>
  ),
}

/** Empty state — no defaultValue, nothing selected. Tab lands on the first
 *  enabled item; Space selects it; Arrow keys both move and select. */
export const NoSelection: Story = {
  render: () => (
    <RadioGroup label="Employment type">
      <RadioGroup.Item value="fulltime" label="Full-time" />
      <RadioGroup.Item value="parttime" label="Part-time" />
      <RadioGroup.Item value="contract" label="Contract" />
    </RadioGroup>
  ),
}

/** Group-level disabled: Radix disables every item button, so the peer-driven
 *  text dimming applies to all rows — control, label and description. */
export const DisabledGroup: Story = {
  render: () => (
    <RadioGroup label="Payout schedule" defaultValue="monthly" disabled>
      <RadioGroup.Item value="weekly" label="Weekly" />
      <RadioGroup.Item value="monthly" label="Monthly" description="Locked while an audit is running." />
    </RadioGroup>
  ),
}

/** A single disabled item — Arrow-key navigation skips it. */
export const DisabledItem: Story = {
  render: () => (
    <RadioGroup label="Contact channel" defaultValue="email">
      <RadioGroup.Item value="email" label="Email" />
      <RadioGroup.Item value="phone" label="Phone" />
      <RadioGroup.Item value="fax" label="Fax" description="No longer supported." disabled />
    </RadioGroup>
  ),
}

/** No visible label — name the group with aria-label instead. */
export const WithoutVisibleLabel: Story = {
  render: () => (
    <RadioGroup aria-label="Sort order" defaultValue="newest">
      <RadioGroup.Item value="newest" label="Newest first" />
      <RadioGroup.Item value="oldest" label="Oldest first" />
    </RadioGroup>
  ),
}

/** Caller className relayouts the grid; orientation="horizontal" keeps the
 *  Radix Left/Right arrow-key mapping in sync with the visual axis. */
export const HorizontalLayout: Story = {
  render: () => (
    <RadioGroup
      label="Currency"
      defaultValue="myr"
      orientation="horizontal"
      className="flex flex-wrap items-center gap-x-6 gap-y-2"
    >
      <RadioGroup.Item value="myr" label="MYR" />
      <RadioGroup.Item value="sgd" label="SGD" />
      <RadioGroup.Item value="aud" label="AUD" />
    </RadioGroup>
  ),
}

function ControlledDemo() {
  const [value, setValue] = useState('video')
  return (
    <div className="grid gap-4">
      <RadioGroup label="Interview format" value={value} onValueChange={setValue}>
        <RadioGroup.Item value="onsite" label="On-site" />
        <RadioGroup.Item value="video" label="Video call" />
        <RadioGroup.Item value="phone" label="Phone" />
      </RadioGroup>
      <p className="text-sm text-fg-muted">
        Selected: <span className="font-medium text-fg">{value}</span>
      </p>
    </div>
  )
}

/** Controlled value + onValueChange — the usual form-state wiring. */
export const Controlled: Story = {
  render: () => <ControlledDemo />,
}

/** Realistic in-context example: a job-post settings card. */
export const InContext: Story = {
  render: () => (
    <div className="max-w-md rounded-xl2 border border-border bg-surface p-6 shadow-card">
      <h3 className="font-display text-xl text-fg">Salary visibility</h3>
      <p className="mt-1 text-sm text-fg-muted">Control who sees the salary range on this job post.</p>
      <RadioGroup aria-label="Salary visibility" defaultValue="registered" className="mt-5 gap-4">
        <RadioGroup.Item
          value="public"
          label="Public"
          description="Anyone browsing the job board can see the range."
        />
        <RadioGroup.Item
          value="registered"
          label="Registered talent only"
          description="Shown after a candidate signs in."
        />
        <RadioGroup.Item
          value="hidden"
          label="Hidden"
          description="Shared only after you shortlist a candidate."
        />
      </RadioGroup>
    </div>
  ),
}

/** Caller className wins over the recipe defaults (cn/twMerge merges it last). */
export const CustomClassName: Story = {
  render: () => (
    <RadioGroup
      label="Team size"
      defaultValue="small"
      className="gap-3 rounded-xl2 border border-border bg-surface-2 p-4"
    >
      <RadioGroup.Item value="solo" label="Just me" />
      <RadioGroup.Item value="small" label="2–10 people" />
      <RadioGroup.Item value="large" label="11+ people" />
    </RadioGroup>
  ),
}
