import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import Consent from './Consent'

const meta: Meta<typeof Consent> = {
  component: Consent,
  tags: ['autodocs'],
  args: { checked: false, label: 'I agree to the Terms of Service' },
}
export default meta
type Story = StoryObj<typeof Consent>

export const Required: Story = {
  render: (args) => {
    const [v, setV] = useState(args.checked)
    return <Consent {...args} checked={v} onChange={setV} required />
  },
}

export const Optional: Story = {
  render: (args) => {
    const [v, setV] = useState(args.checked)
    return (
      <Consent
        {...args}
        checked={v}
        onChange={setV}
        label="Subscribe me to the BoLe newsletter"
      />
    )
  },
}

export const LongLabel: Story = {
  render: (args) => {
    const [v, setV] = useState(false)
    return (
      <Consent
        {...args}
        checked={v}
        onChange={setV}
        label="I consent to BoLe using my date of birth for its compatibility matching algorithm. My DOB will be encrypted and never shared with employers or other users."
        required
      />
    )
  },
}
