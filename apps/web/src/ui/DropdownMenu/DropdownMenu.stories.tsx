import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../Button'
import { DropdownMenu } from './DropdownMenu'

/** Decorative story icons (mirrors how call-sites pass aria-hidden SVGs). */
function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="5" rx="1" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" />
    </svg>
  )
}

const meta: Meta<typeof DropdownMenu> = {
  component: DropdownMenu,
  tags: ['autodocs'],
  args: { align: 'start', side: 'bottom', sideOffset: 6, modal: true },
  argTypes: {
    align: { control: 'select', options: ['start', 'center', 'end'] },
    side: { control: 'select', options: ['top', 'right', 'bottom', 'left'] },
    sideOffset: { control: 'number' },
    modal: { control: 'boolean' },
    trigger: { control: false },
    children: { control: false },
    open: { control: false },
    defaultOpen: { control: false },
    onOpenChange: { control: false },
    className: { control: false },
  },
}
export default meta
type Story = StoryObj<typeof DropdownMenu>

/** Full keyboard support comes from Radix: Enter / Space / ArrowDown opens,
 *  arrows move (wrapping via `loop`), Home/End jump, typing jumps by label
 *  (typeahead), Esc closes and returns focus to the trigger. */
export const Playground: Story = {
  render: (args) => (
    <DropdownMenu {...args} trigger={<Button variant="secondary">Options</Button>}>
      <DropdownMenu.Item onSelect={() => {}}>Edit listing</DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => {}}>Duplicate</DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => {}}>Archive</DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item danger onSelect={() => {}}>Delete</DropdownMenu.Item>
    </DropdownMenu>
  ),
}

/** Rendered open (non-modal so the docs page keeps scrolling) — shows the
 *  panel treatment: bg-surface, border-border, rounded-xl, shadow-float, p-1.
 *  Toggle the Storybook theme to verify dark parity. */
export const OpenPanel: Story = {
  render: () => (
    <div className="pb-56">
      <DropdownMenu
        defaultOpen
        modal={false}
        trigger={<Button variant="secondary">Always open</Button>}
      >
        <DropdownMenu.Label>Listing</DropdownMenu.Label>
        <DropdownMenu.Item icon={<EditIcon />} onSelect={() => {}}>Edit</DropdownMenu.Item>
        <DropdownMenu.Item icon={<CopyIcon />} onSelect={() => {}}>Duplicate</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item danger icon={<TrashIcon />} onSelect={() => {}}>Delete</DropdownMenu.Item>
      </DropdownMenu>
    </div>
  ),
}

/** Leading icon slot — decorative (aria-hidden), muted to fg-subtle on
 *  neutral items; danger items inherit the red via currentColor. */
export const WithIcons: Story = {
  render: () => (
    <DropdownMenu trigger={<Button variant="secondary">With icons</Button>}>
      <DropdownMenu.Item icon={<EditIcon />} onSelect={() => {}}>Edit listing</DropdownMenu.Item>
      <DropdownMenu.Item icon={<CopyIcon />} onSelect={() => {}}>Duplicate</DropdownMenu.Item>
      <DropdownMenu.Item icon={<ArchiveIcon />} onSelect={() => {}}>Archive</DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item danger icon={<TrashIcon />} onSelect={() => {}}>Delete listing</DropdownMenu.Item>
    </DropdownMenu>
  ),
}

/** Danger items: red-600 text, red-50 highlight (red-700 text while
 *  highlighted for AA); dark theme flips to red-400 on a red-950 tint.
 *  Conventionally separated from safe actions by a Separator. */
export const DangerItem: Story = {
  render: () => (
    <DropdownMenu trigger={<Button variant="secondary">Destructive actions</Button>}>
      <DropdownMenu.Item onSelect={() => {}}>Rename</DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item danger onSelect={() => {}}>Remove candidate</DropdownMenu.Item>
      <DropdownMenu.Item danger icon={<TrashIcon />} onSelect={() => {}}>Delete permanently</DropdownMenu.Item>
    </DropdownMenu>
  ),
}

/** Disabled items: 50% opacity + pointer-events-none, skipped by keyboard
 *  navigation (Radix `disabled`). Works on neutral and danger items alike. */
export const DisabledItems: Story = {
  render: () => (
    <DropdownMenu trigger={<Button variant="secondary">Some disabled</Button>}>
      <DropdownMenu.Item onSelect={() => {}}>Available action</DropdownMenu.Item>
      <DropdownMenu.Item disabled icon={<CopyIcon />}>Duplicate (plan limit)</DropdownMenu.Item>
      <DropdownMenu.Item disabled>Archive (no permission)</DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item danger disabled icon={<TrashIcon />}>Delete (locked)</DropdownMenu.Item>
    </DropdownMenu>
  ),
}

/** Labels group related items into sections; separators divide the groups.
 *  Labels are non-interactive and skipped by arrow-key navigation. */
export const LabelsAndSeparators: Story = {
  render: () => (
    <DropdownMenu trigger={<Button variant="secondary">Grouped menu</Button>}>
      <DropdownMenu.Label>Listing</DropdownMenu.Label>
      <DropdownMenu.Item icon={<EditIcon />} onSelect={() => {}}>Edit</DropdownMenu.Item>
      <DropdownMenu.Item icon={<CopyIcon />} onSelect={() => {}}>Duplicate</DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Label>Visibility</DropdownMenu.Label>
      <DropdownMenu.Item onSelect={() => {}}>Publish</DropdownMenu.Item>
      <DropdownMenu.Item icon={<ArchiveIcon />} onSelect={() => {}}>Archive</DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item danger icon={<TrashIcon />} onSelect={() => {}}>Delete</DropdownMenu.Item>
    </DropdownMenu>
  ),
}

/** `align` positions the panel against the trigger edge; `side` picks the
 *  opening direction (auto-flips on viewport collision). */
export const Placement: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(['start', 'center', 'end'] as const).map((align) => (
        <DropdownMenu
          key={align}
          align={align}
          trigger={<Button variant="secondary">align {align}</Button>}
        >
          <DropdownMenu.Item onSelect={() => {}}>First action</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => {}}>Second action</DropdownMenu.Item>
        </DropdownMenu>
      ))}
      <DropdownMenu side="top" trigger={<Button variant="secondary">side top</Button>}>
        <DropdownMenu.Item onSelect={() => {}}>First action</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => {}}>Second action</DropdownMenu.Item>
      </DropdownMenu>
    </div>
  ),
}

/** Realistic in-context use: the kebab actions menu on a candidate row.
 *  Icon-only triggers must carry their own accessible name (aria-label) —
 *  Radix adds aria-haspopup / aria-expanded automatically. */
export const InContext: Story = {
  render: () => (
    <div className="max-w-md rounded-xl2 border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            AR
          </div>
          <div>
            <div className="text-sm font-medium text-fg">Aisyah Rahman</div>
            <div className="text-xs text-fg-muted">Senior Goldsmith · Kuala Lumpur</div>
          </div>
        </div>
        <DropdownMenu
          align="end"
          trigger={
            <Button variant="ghost" size="sm" aria-label="Candidate actions">
              <DotsIcon />
            </Button>
          }
        >
          <DropdownMenu.Label>Candidate</DropdownMenu.Label>
          <DropdownMenu.Item icon={<EditIcon />} onSelect={() => {}}>View profile</DropdownMenu.Item>
          <DropdownMenu.Item icon={<CopyIcon />} onSelect={() => {}}>Copy profile link</DropdownMenu.Item>
          <DropdownMenu.Item icon={<ArchiveIcon />} onSelect={() => {}}>Move to shortlist</DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item danger icon={<TrashIcon />} onSelect={() => {}}>Remove candidate</DropdownMenu.Item>
        </DropdownMenu>
      </div>
    </div>
  ),
}

/** Caller className wins over panel defaults (cn/twMerge merges it last). */
export const CustomClassName: Story = {
  render: () => (
    <DropdownMenu
      className="min-w-64 rounded-lg"
      trigger={<Button variant="secondary">Wide panel override</Button>}
    >
      <DropdownMenu.Item onSelect={() => {}}>min-w-64 + rounded-lg panel</DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => {}}>Second action</DropdownMenu.Item>
    </DropdownMenu>
  ),
}
