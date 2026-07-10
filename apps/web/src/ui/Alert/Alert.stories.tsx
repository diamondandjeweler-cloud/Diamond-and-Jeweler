import type { Meta, StoryObj } from '@storybook/react'
import { Alert } from './Alert'

const meta: Meta<typeof Alert> = {
  component: Alert,
  tags: ['autodocs'],
  argTypes: {
    tone: { control: 'select', options: ['brand', 'amber', 'red', 'green'] },
  },
  args: {
    title: 'Heads up',
    children: 'Something worth knowing happened.',
  },
}
export default meta
type Story = StoryObj<typeof Alert>

/* ------------------ Tones ------------------ */

export const Brand: Story = {
  args: { tone: 'brand', title: 'New feature', children: 'Life-chart matching is now available on every job post.' },
}

export const Amber: Story = {
  args: { tone: 'amber', title: 'Pending verification', children: 'Your profile is visible to hiring managers once verification completes.' },
}

export const Red: Story = {
  args: { tone: 'red', title: 'Payment failed', children: 'We could not charge your card. Update your billing details and retry.' },
}

export const Green: Story = {
  args: { tone: 'green', title: 'Application sent', children: 'The hiring manager has been notified. We will keep you posted.' },
}

/* ------------------ States ------------------ */

/** No `title` — body copy only, icon still vertically aligned to the first line. */
export const WithoutTitle: Story = {
  args: { tone: 'brand', title: undefined, children: 'A single-line notice without a heading.' },
}

/** Caller-supplied `icon` replaces the per-tone default glyph. */
export const CustomIcon: Story = {
  args: {
    tone: 'green',
    title: 'Custom icon',
    children: 'Any ReactNode can replace the built-in tone icon.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2l2.9 6.26L21 9.27l-4.5 4.38L17.8 20 12 16.77 6.2 20l1.3-6.35L3 9.27l6.1-1.01L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
}

/** Long wrapping content — `min-w-0 flex-1` keeps the body from overflowing. */
export const LongContent: Story = {
  args: {
    tone: 'amber',
    title: 'Scheduled maintenance',
    children:
      'The platform will be read-only on Saturday between 02:00 and 04:00 MYT while we upgrade the database. ' +
      'Drafts are saved locally and will sync automatically once the maintenance window closes, so no action is required on your side.',
  },
}

/** Every tone side by side, with and without a title. */
export const AllTones: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-3">
      <Alert tone="brand" title="Brand">Informational notice on the brand scale.</Alert>
      <Alert tone="amber" title="Amber">Warning notice on the amber scale.</Alert>
      <Alert tone="red" title="Red">Error notice on the red scale.</Alert>
      <Alert tone="green" title="Green">Success notice on the emerald scale.</Alert>
      <Alert tone="brand">Brand, title-less.</Alert>
      <Alert tone="red">Red, title-less.</Alert>
    </div>
  ),
}
