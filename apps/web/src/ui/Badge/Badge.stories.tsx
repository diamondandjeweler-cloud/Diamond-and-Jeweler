import type { Meta, StoryObj } from '@storybook/react'
import { Badge, type BadgeTone } from './Badge'

const TONES: BadgeTone[] = ['gray', 'brand', 'green', 'amber', 'red', 'accent']

const meta: Meta<typeof Badge> = {
  component: Badge,
  tags: ['autodocs'],
  args: { children: 'Badge', tone: 'gray', dot: false },
  argTypes: {
    tone: { control: 'select', options: TONES },
    dot: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Badge>

export const Playground: Story = {}

/** Every tone side by side. Toggle the Storybook theme to verify dark parity. */
export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {TONES.map((tone) => (
        <Badge key={tone} tone={tone}>{tone}</Badge>
      ))}
    </div>
  ),
}

/** Every tone with its leading status dot. */
export const WithDot: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {TONES.map((tone) => (
        <Badge key={tone} tone={tone} dot>{tone}</Badge>
      ))}
    </div>
  ),
}

/** Realistic content — counts and multi-word status labels. */
export const InContext: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="green" dot>Active</Badge>
      <Badge tone="amber" dot>Pending review</Badge>
      <Badge tone="red" dot>Rejected</Badge>
      <Badge tone="brand">12 new</Badge>
      <Badge tone="accent">Featured</Badge>
      <Badge>Draft</Badge>
    </div>
  ),
}

/** Caller className wins over variant defaults (cn/twMerge merges it last). */
export const CustomClassName: Story = {
  args: { tone: 'brand', children: 'Overridden padding', className: 'px-3 py-1 uppercase tracking-wide' },
}
