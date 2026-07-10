import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../Button'
import { Tooltip, type TooltipSide } from './Tooltip'

const SIDES: TooltipSide[] = ['top', 'right', 'bottom', 'left']

/** Decorative story icons (mirror how call-sites pass aria-hidden SVGs). */
function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.8 6.6 19.6l1.1-6L3.2 9.4l6.1-.8L12 3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V4m0 0L8 8m4-4l4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 4h18v4H3V4zm1 4h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8zm6 4h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const meta: Meta<typeof Tooltip> = {
  component: Tooltip,
  tags: ['autodocs'],
  args: {
    content: 'Save this candidate to your shortlist',
    side: 'top',
    align: 'center',
    sideOffset: 6,
    delayDuration: 300,
  },
  argTypes: {
    content: { control: 'text' },
    side: { control: 'select', options: SIDES },
    align: { control: 'select', options: ['start', 'center', 'end'] },
    sideOffset: { control: { type: 'number', min: 0, step: 1 } },
    delayDuration: { control: { type: 'number', min: 0, step: 100 } },
    children: { control: false },
    className: { control: false },
    open: { control: false },
    defaultOpen: { control: false },
    onOpenChange: { control: false },
  },
  // Breathing room so the floating panel isn't clipped by the story frame.
  decorators: [
    (Story) => (
      <div className="flex min-h-[10rem] items-center justify-center p-12">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof Tooltip>

export const Playground: Story = {
  render: (args) => (
    <Tooltip {...args}>
      <Button variant="secondary">Hover or focus me</Button>
    </Tooltip>
  ),
}

/** All four placements, pinned open (controlled `open`) so both themes can be
 *  eyeballed without hovering. Each side flips automatically on collision. */
export const Sides: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-x-28 gap-y-20 p-10">
      {SIDES.map((side) => (
        <Tooltip key={side} content={`Pinned ${side}`} side={side} open>
          <Button variant="secondary">{side}</Button>
        </Tooltip>
      ))}
    </div>
  ),
}

/** Hover-open delay. 0 feels instant (dense toolbars), 300 is the house
 *  default, 700 is Radix's stock default. Keyboard focus always opens
 *  immediately regardless of delay. */
export const DelayDurations: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {[0, 300, 700].map((ms) => (
        <Tooltip key={ms} content={`Opens after ${ms}ms`} delayDuration={ms}>
          <Button variant="secondary">{ms}ms</Button>
        </Tooltip>
      ))}
    </div>
  ),
}

/** Keyboard support comes from Radix: Tab to the trigger to open, Escape or
 *  blur to dismiss. The trigger keeps the global :focus-visible outline. */
export const KeyboardFocus: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <Tooltip content="Opens on focus, not just hover">
          <Button variant="secondary">Tab to me</Button>
        </Tooltip>
        <Tooltip content="Escape dismisses without moving focus">
          <Button variant="secondary">Then to me</Button>
        </Tooltip>
      </div>
      <p className="text-xs text-fg-muted">Tab into the buttons, then press Escape.</p>
    </div>
  ),
}

/** Disabled elements emit no pointer events, so the tip explains WHY the
 *  action is unavailable via a focusable span proxy around the button —
 *  the accessible pattern for disabled-trigger tooltips. */
export const DisabledTrigger: Story = {
  render: () => (
    <Tooltip content="Complete the company profile before publishing">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a focusable proxy is the standard pattern for tooltipping a disabled control, which itself emits no focus/hover events. */}
      <span tabIndex={0} className="inline-block rounded-lg">
        <Button disabled>Publish listing</Button>
      </span>
    </Tooltip>
  ),
}

/** Nullish / empty content renders the trigger alone — no Radix tree, no
 *  empty panel flashing on hover. */
export const EmptyContent: Story = {
  render: () => (
    <Tooltip content="">
      <Button variant="secondary">No tooltip on me</Button>
    </Tooltip>
  ),
}

/** Long hints wrap inside max-w-xs instead of spanning the viewport. */
export const LongContent: Story = {
  render: () => (
    <Tooltip
      content="Shortlisting notifies the hiring manager and moves the candidate into the review queue for this listing."
      defaultOpen
    >
      <Button variant="secondary">Long hint</Button>
    </Tooltip>
  ),
}

/** Realistic in-context example — an icon-only row of listing actions. The
 *  buttons carry their own aria-labels; the tooltips merely echo them, so
 *  nothing essential lives in the ephemeral panel. */
export const InContext: Story = {
  render: () => (
    <div className="flex items-center gap-1 rounded-xl2 border border-border bg-surface p-1.5 shadow-card">
      <Tooltip content="Shortlist candidate">
        <Button variant="ghost" size="sm" aria-label="Shortlist candidate">
          <StarIcon />
        </Button>
      </Tooltip>
      <Tooltip content="Share profile">
        <Button variant="ghost" size="sm" aria-label="Share profile">
          <ShareIcon />
        </Button>
      </Tooltip>
      <Tooltip content="Archive listing">
        <Button variant="ghost" size="sm" aria-label="Archive listing">
          <ArchiveIcon />
        </Button>
      </Tooltip>
    </div>
  ),
}

/** Caller className wins over the recipe defaults (cn/twMerge merges it last). */
export const CustomClassName: Story = {
  render: () => (
    <Tooltip content="Narrow, centered override" className="max-w-[10rem] text-center" defaultOpen>
      <Button variant="secondary">Custom panel class</Button>
    </Tooltip>
  ),
}
