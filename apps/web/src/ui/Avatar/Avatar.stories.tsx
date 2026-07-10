import type { Meta, StoryObj } from '@storybook/react'
import { Avatar, type AvatarSize } from './Avatar'

const SIZES: AvatarSize[] = ['xs', 'sm', 'md', 'lg']

/**
 * Story-only fixture portrait as an inline data URI, so Storybook needs no
 * network and the story is deterministic. Named SVG colors (no hex) keep the
 * library's no-raw-hex rule intact even in fixtures.
 */
const PORTRAIT_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
  "<rect width='64' height='64' fill='lightsteelblue'/>" +
  "<circle cx='32' cy='25' r='11' fill='white'/>" +
  "<path d='M11 58c2-13 11-19 21-19s19 6 21 19z' fill='white'/>" +
  '</svg>'
const DEMO_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(PORTRAIT_SVG)}`

/** Malformed data URI — fires onError immediately, no network, no flakiness. */
const BROKEN_SRC = 'data:image/png;base64,not-an-image'

const meta: Meta<typeof Avatar> = {
  component: Avatar,
  tags: ['autodocs'],
  args: { name: 'Aisha Rahman', size: 'md' },
  argTypes: {
    size: { control: 'select', options: SIZES },
    name: { control: 'text' },
    src: { control: 'text' },
  },
}
export default meta
type Story = StoryObj<typeof Avatar>

export const Playground: Story = {}

/** All four sizes, initials fallback and photo side by side. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {SIZES.map((size) => (
          <Avatar key={size} size={size} name="Aisha Rahman" />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {SIZES.map((size) => (
          <Avatar key={size} size={size} name="Aisha Rahman" src={DEMO_SRC} />
        ))}
      </div>
    </div>
  ),
}

/**
 * All six deterministic tints. These names hash to each tint in cycle order
 * (brand / green / amber / red / accent / gray) — the same name always lands
 * on the same tint. Toggle the Storybook theme: tints stay identical (identity
 * colors are theme-stable); only the token ring flips.
 */
export const FallbackTints: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Avatar name="Liam Wong" />   {/* brand  */}
      <Avatar name="Grace Tan" />   {/* green  */}
      <Avatar name="Mei Lin" />     {/* amber  */}
      <Avatar name="Emma Stone" />  {/* red    */}
      <Avatar name="Hana Yusof" />  {/* accent */}
      <Avatar name="Marcus Chen" /> {/* gray   */}
    </div>
  ),
}

/** With a photo: the image covers the circle; the tint keeps serving as the
 *  loading placeholder underneath while the photo streams in. */
export const WithImage: Story = {
  args: { name: 'Aisha Rahman', src: DEMO_SRC, size: 'lg' },
}

/** Error state: a src that fails to load falls back to initials on the
 *  name's tint — same rendering as having passed no src at all. */
export const BrokenImage: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Avatar name="Aisha Rahman" src={BROKEN_SRC} size="lg" />
      <Avatar name="Aisha Rahman" src={DEMO_SRC} size="lg" />
      <span className="text-sm text-fg-muted">broken src vs working src</span>
    </div>
  ),
}

/** Empty and awkward names: single word → one initial; blank name → empty
 *  tinted circle (aria-label is empty too — give real names where possible);
 *  whitespace and many-word names collapse to first + last initials. */
export const EdgeCases: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Avatar name="Cher" />
      <Avatar name="  Mary   Jane   Watson  " />
      <Avatar name="Wei Ting Goh" />
      <Avatar name="" />
    </div>
  ),
}

/** Realistic usage: a member list row plus an overlapping avatar stack. The
 *  stack overrides the token hairline with a surface-colored separator ring
 *  via className (cn/twMerge lets the caller's ring win). */
export const InContext: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-4 rounded-xl2 border border-border bg-surface p-4 shadow-card">
      <ul className="flex flex-col gap-3">
        {[
          { name: 'Aisha Rahman', role: 'Hiring manager', src: DEMO_SRC },
          { name: 'Liam Wong', role: 'Talent lead' },
          { name: 'Grace Tan', role: 'Recruiter' },
        ].map(({ name, role, src }) => (
          <li key={name} className="flex items-center gap-3">
            <Avatar name={name} src={src} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-fg">{name}</div>
              <div className="truncate text-xs text-fg-muted">{role}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center">
        <div className="flex -space-x-2">
          <Avatar name="Emma Stone" size="xs" className="ring-2 ring-surface" />
          <Avatar name="Hana Yusof" size="xs" className="ring-2 ring-surface" />
          <Avatar name="Marcus Chen" size="xs" className="ring-2 ring-surface" />
        </div>
        <span className="ml-2 text-xs text-fg-subtle">+4 more reviewers</span>
      </div>
    </div>
  ),
}

/** Caller className wins over variant defaults (cn/twMerge merges it last) —
 *  here a squircle shape and a size outside the scale. */
export const CustomClassName: Story = {
  args: { name: 'Aisha Rahman', className: 'h-16 w-16 rounded-xl2 text-xl' },
}
