import type { Meta, StoryObj } from '@storybook/react'
import LoadingSpinner from './LoadingSpinner'

const meta: Meta<typeof LoadingSpinner> = {
  component: LoadingSpinner,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof LoadingSpinner>

export const Inline: Story = {
  args: { full: false },
}

export const FullScreen: Story = {
  args: { full: true },
  parameters: { layout: 'fullscreen' },
}
