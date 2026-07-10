import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Switch } from './Switch'

const meta: Meta<typeof Switch> = {
  component: Switch,
  tags: ['autodocs'],
  args: {
    label: 'Email notifications',
    description: 'Get a digest of new listings every morning.',
    defaultChecked: true,
    disabled: false,
  },
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    defaultChecked: { control: 'boolean' },
    disabled: { control: 'boolean' },
    checked: { control: false },
    onCheckedChange: { control: false },
  },
}
export default meta
type Story = StoryObj<typeof Switch>

export const Playground: Story = {}

/** Both track states side by side (uncontrolled via defaultChecked). Toggle
 *  the Storybook theme to verify the unchecked track flips with the
 *  border-strong token while checked stays brand-600. */
export const States: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Switch aria-label="Unchecked example" />
      <Switch aria-label="Checked example" defaultChecked />
    </div>
  ),
}

/** Standalone control with no visible text — the "empty" shape. An aria-label
 *  is REQUIRED here so the switch still has an accessible name (e.g. inside a
 *  table row where the column header provides visual context). */
export const StandaloneWithAriaLabel: Story = {
  render: () => <Switch aria-label="Publish listing" defaultChecked />,
}

/** Visible label only — clicking the text toggles the switch (htmlFor), and
 *  screen readers announce it via aria-labelledby. */
export const WithLabel: Story = {
  render: () => <Switch label="Auto-renew listing" defaultChecked />,
}

/** Label + description — the description is announced via aria-describedby. */
export const WithDescription: Story = {
  render: () => (
    <Switch
      label="Email notifications"
      description="Get a digest of new listings every morning."
      defaultChecked
    />
  ),
}

/** Disabled in both states: track at 50% opacity with pointer events off; the
 *  label/description stack dims to match and drops its pointer cursor. */
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Switch label="Disabled off" description="Locked by your plan." disabled />
      <Switch label="Disabled on" description="Managed by your administrator." disabled defaultChecked />
    </div>
  ),
}

/** Controlled usage — `checked` + `onCheckedChange`, the primary API. */
function ControlledDemo() {
  const [checked, setChecked] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <Switch
        label="Instant alerts"
        description="Push a notification the moment a match appears."
        checked={checked}
        onCheckedChange={setChecked}
      />
      <p className="text-sm text-fg-muted">
        State: <span className="font-medium text-fg">{checked ? 'on' : 'off'}</span>
      </p>
    </div>
  )
}
export const Controlled: Story = {
  render: () => <ControlledDemo />,
}

/** Realistic in-context example — a notification-settings card composed from
 *  surface/border/fg tokens, with a mix of states. */
function SettingsPanelDemo() {
  const [alerts, setAlerts] = useState(true)
  const [digest, setDigest] = useState(false)
  return (
    <div className="max-w-md rounded-xl2 border border-border bg-surface p-6 shadow-card">
      <h3 className="font-display text-lg text-fg">Notifications</h3>
      <p className="mt-1 text-sm text-fg-muted">Choose how DNJ keeps you in the loop.</p>
      <div className="mt-5 flex flex-col gap-5">
        <Switch
          label="Instant match alerts"
          description="Notify me the moment a new match appears."
          checked={alerts}
          onCheckedChange={setAlerts}
        />
        <Switch
          label="Weekly digest"
          description="A Monday-morning summary of activity."
          checked={digest}
          onCheckedChange={setDigest}
        />
        <Switch
          label="SMS reminders"
          description="Requires a verified phone number."
          disabled
        />
      </div>
    </div>
  )
}
export const InContext: Story = {
  render: () => <SettingsPanelDemo />,
}

/** Caller className wins over variant defaults (cn/twMerge merges it last) —
 *  here recoloring the checked track to the accent scale. */
export const CustomClassName: Story = {
  render: () => (
    <Switch
      label="Featured placement"
      defaultChecked
      className="data-[state=checked]:bg-accent-600"
    />
  ),
}
