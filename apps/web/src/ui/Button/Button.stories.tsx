import type { Meta, StoryObj } from '@storybook/react'
import { Button, Spinner, type ButtonVariant, type ButtonSize } from './Button'

const VARIANTS: ButtonVariant[] = ['primary', 'brand', 'secondary', 'ghost', 'danger', 'success']
const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

/** Decorative story icon (mirrors how call-sites pass aria-hidden SVGs). */
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const meta: Meta<typeof Button> = {
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Button', variant: 'primary', size: 'md', loading: false, disabled: false },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    size: { control: 'select', options: SIZES },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    leftIcon: { control: false },
    rightIcon: { control: false },
    asChild: { control: false },
  },
}
export default meta
type Story = StoryObj<typeof Button>

export const Playground: Story = {}

/** Every variant side by side. Toggle the Storybook theme to verify dark parity. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {VARIANTS.map((variant) => (
        <Button key={variant} variant={variant}>{variant}</Button>
      ))}
    </div>
  ),
}

/** All sizes. Ghost keeps its tighter md box (px-3 py-2), as in the legacy CSS. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(['primary', 'secondary', 'ghost'] as const).map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-2">
          {SIZES.map((size) => (
            <Button key={size} variant={variant} size={size}>{variant} {size}</Button>
          ))}
        </div>
      ))}
    </div>
  ),
}

/** Loading swaps the left slot for a size-matched spinner, disables the button
 *  and sets aria-busy. */
export const Loading: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {SIZES.map((size) => (
        <Button key={size} size={size} loading>Saving…</Button>
      ))}
      <Button variant="brand" loading>Submitting</Button>
      <Button variant="secondary" loading>Refreshing</Button>
    </div>
  ),
}

/** Disabled: 50% opacity + pointer-events-none across every variant. */
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {VARIANTS.map((variant) => (
        <Button key={variant} variant={variant} disabled>{variant}</Button>
      ))}
    </div>
  ),
}

/** Icon slots — only composed in the native-button path. */
export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button leftIcon={<PlusIcon />}>New listing</Button>
      <Button variant="brand" rightIcon={<ArrowIcon />}>Continue</Button>
      <Button variant="secondary" leftIcon={<PlusIcon />} rightIcon={<ArrowIcon />}>Both slots</Button>
      <Button variant="ghost" size="sm" leftIcon={<PlusIcon />}>Add</Button>
    </div>
  ),
}

/** asChild merges button styling onto the caller's single child (here an
 *  anchor) via Radix Slot — no extra <button> wrapper in the DOM. */
export const AsChild: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="brand">
        <a href="#pricing">View pricing</a>
      </Button>
      <Button asChild variant="secondary">
        <a href="#careers">Careers</a>
      </Button>
    </div>
  ),
}

/** Standalone spinner export, in each size. */
export const StandaloneSpinner: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-fg-muted">
      {SIZES.map((size) => (
        <Spinner key={size} size={size} />
      ))}
    </div>
  ),
}

/** Caller className wins over variant defaults (cn/twMerge merges it last). */
export const CustomClassName: Story = {
  args: { variant: 'secondary', children: 'Full-width override', className: 'w-full rounded-full' },
}
