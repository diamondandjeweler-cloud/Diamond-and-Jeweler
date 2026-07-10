import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Checkbox } from './Checkbox'

const meta: Meta<typeof Checkbox> = {
  component: Checkbox,
  tags: ['autodocs'],
  args: {
    label: 'Email me new match alerts',
    description: '',
    defaultChecked: true,
    disabled: false,
    indeterminate: false,
  },
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    defaultChecked: { control: 'boolean' },
    disabled: { control: 'boolean' },
    indeterminate: { control: 'boolean' },
    // Controlled props — pairing them in a static playground would freeze the
    // control, so the playground stays uncontrolled via defaultChecked.
    checked: { control: false },
    onCheckedChange: { control: false },
  },
}
export default meta
type Story = StoryObj<typeof Checkbox>

export const Playground: Story = {}

/** The three visual states side by side. Toggle the Storybook theme to verify
 *  dark parity — the unchecked box flips via tokens, the on-fill stays
 *  brand-600 in both themes. Bare boxes carry aria-label for their name. */
export const States: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Checkbox aria-label="Unchecked" />
      <Checkbox aria-label="Checked" defaultChecked />
      <Checkbox aria-label="Some selected" indeterminate />
    </div>
  ),
}

/** Label is wired via htmlFor — clicking the text toggles the box. */
export const WithLabel: Story = {
  render: () => <Checkbox label="Accept the talent agreement" />,
}

/** Description renders muted under the label and is announced to screen
 *  readers via aria-describedby. */
export const WithDescription: Story = {
  render: () => (
    <Checkbox
      label="WhatsApp notifications"
      description="Get a message the moment a hiring manager shortlists you."
      defaultChecked
    />
  ),
}

/** Disabled across every state: the box drops to 50% opacity with
 *  pointer-events-none, and the wired text dims to match. */
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Checkbox aria-label="Disabled unchecked" disabled />
        <Checkbox aria-label="Disabled checked" disabled defaultChecked />
        <Checkbox aria-label="Disabled some selected" disabled indeterminate />
      </div>
      <Checkbox
        label="Locked by your workspace admin"
        description="Contact an admin to change this preference."
        disabled
        defaultChecked
      />
    </div>
  ),
}

/** Controlled tri-state: a "Select all" parent shows the indeterminate dash
 *  while only some children are ticked; clicking it from mixed selects all. */
function SelectAllDemo() {
  const [selected, setSelected] = useState<boolean[]>([true, false, true])
  const allChecked = selected.every(Boolean)
  const someChecked = selected.some(Boolean)
  const roles = ['Barista — Bangsar', 'Line cook — Mont Kiara', 'Host — KLCC']
  return (
    <div className="flex flex-col gap-2">
      <Checkbox
        label="Select all roles"
        checked={allChecked}
        indeterminate={someChecked && !allChecked}
        onCheckedChange={(next) => setSelected(selected.map(() => next))}
      />
      <div className="flex flex-col gap-2 pl-6">
        {roles.map((role, i) => (
          <Checkbox
            key={role}
            label={role}
            checked={selected[i]}
            onCheckedChange={(next) => setSelected(selected.map((v, j) => (j === i ? next : v)))}
          />
        ))}
      </div>
    </div>
  )
}

export const Indeterminate: Story = {
  render: () => <SelectAllDemo />,
}

/** Realistic in-context example — a notification-preferences card. */
export const InContext: Story = {
  render: () => (
    <div className="max-w-md rounded-xl2 border border-border bg-surface p-5 shadow-card">
      <h3 className="font-display text-lg text-fg">Notifications</h3>
      <p className="mt-1 text-sm text-fg-muted">Choose how we keep you in the loop.</p>
      <div className="mt-4 flex flex-col gap-4">
        <Checkbox
          label="New match alerts"
          description="Email when a role matches your profile."
          defaultChecked
        />
        <Checkbox
          label="Interview reminders"
          description="A nudge 24 hours and 1 hour before each interview."
          defaultChecked
        />
        <Checkbox label="Weekly digest" description="A Monday summary of new roles near you." />
        <Checkbox
          label="SMS updates"
          description="Requires a verified Malaysian mobile number."
          disabled
        />
      </div>
    </div>
  ),
}

/** Caller className lands on the box element and wins over variant defaults
 *  (cn/twMerge merges it last) — here rounding the box fully. */
export const CustomClassName: Story = {
  args: { label: 'Rounded override', defaultChecked: true, className: 'rounded-full' },
}
