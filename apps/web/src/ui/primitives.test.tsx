import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Avatar } from './Avatar'
import { Switch } from './Switch'
import { Checkbox } from './Checkbox'
import { RadioGroup, RadioGroupItem } from './RadioGroup'
import { Tabs } from './Tabs'
import { Pagination } from './Pagination'
import { DataList } from './DataList'
import { Alert } from './Alert'
import { Badge } from './Badge'
import { Card } from './Card'
import { Stat } from './Stat'
import { Skeleton } from './Skeleton'

afterEach(cleanup)

describe('<Avatar />', () => {
  it('renders the two-letter initials of first + last word', () => {
    render(<Avatar name="Mary Jane Watson" />)
    expect(screen.getByText('MW')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Mary Jane Watson' })).toBeInTheDocument()
  })

  it('is decorative (no img role) when the name is blank — never an empty-label img', () => {
    render(<Avatar name="   " />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('picks a stable tint regardless of trivial whitespace differences', () => {
    const { container: a } = render(<Avatar name="Mary Jane Watson" />)
    const { container: b } = render(<Avatar name="  Mary   Jane   Watson " />)
    const tintOf = (c: HTMLElement) => (c.firstElementChild as HTMLElement).className.match(/bg-\S+/)?.[0]
    expect(tintOf(a)).toBe(tintOf(b))
  })
})

describe('<Switch />', () => {
  it('exposes role=switch and reflects checked', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} label="Email alerts" />)
    expect(screen.getByRole('switch', { name: 'Email alerts' })).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles on click', async () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onChange} label="Email alerts" />)
    await userEvent.click(screen.getByRole('switch', { name: 'Email alerts' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('toggles on Space when focused (keyboard)', async () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onChange} label="Email alerts" />)
    const sw = screen.getByRole('switch', { name: 'Email alerts' })
    sw.focus()
    expect(sw).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('<Checkbox />', () => {
  it('exposes role=checkbox and fires onCheckedChange(true) when clicked', async () => {
    const onChange = vi.fn()
    render(<Checkbox checked={false} onCheckedChange={onChange} label="I agree" />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'I agree' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('toggles on Space when focused (keyboard)', async () => {
    const onChange = vi.fn()
    render(<Checkbox checked={false} onCheckedChange={onChange} label="I agree" />)
    const cb = screen.getByRole('checkbox', { name: 'I agree' })
    cb.focus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('<RadioGroup />', () => {
  it('renders a labelled radiogroup with one radio per item', () => {
    render(
      <RadioGroup value="a" onValueChange={() => {}} label="Plan">
        <RadioGroupItem value="a" label="Starter" />
        <RadioGroupItem value="b" label="Pro" />
      </RadioGroup>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('reflects the controlled value on the correct radio', () => {
    // (Radix owns the arrow-key roving nav; jsdom can't simulate its focus
    // motion, so that is covered by Storybook/real-browser. Here we assert the
    // checked-state contract, which is what a keyboard user acts on.)
    render(
      <RadioGroup value="b" onValueChange={() => {}} label="Plan">
        <RadioGroupItem value="a" label="Starter" />
        <RadioGroupItem value="b" label="Pro" />
      </RadioGroup>,
    )
    expect(screen.getByRole('radio', { name: 'Pro' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Starter' })).toHaveAttribute('aria-checked', 'false')
  })
})

describe('<RadioGroup variant="segmented" />', () => {
  it('renders each option as a whole-pill radio — the label IS the radio content (no separate circle/label)', () => {
    render(
      <RadioGroup variant="segmented" value="male" onValueChange={() => {}} aria-label="Gender">
        <RadioGroupItem value="male" label="Male" />
        <RadioGroupItem value="female" label="Female" />
      </RadioGroup>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Gender' })).toBeInTheDocument()
    const male = screen.getByRole('radio', { name: 'Male' })
    const female = screen.getByRole('radio', { name: 'Female' })
    expect(male).toHaveAttribute('aria-checked', 'true')
    expect(female).toHaveAttribute('aria-checked', 'false')
    // Whole-pill click target: the visible label lives INSIDE the radio button,
    // and there is no separate <label> element (the pill is its own label).
    expect(male).toHaveTextContent('Male')
    expect(screen.queryByText('Male', { selector: 'label' })).not.toBeInTheDocument()
  })

  it('keeps the segmented pill styling — brand fill when checked, resting border otherwise (parity pin)', () => {
    render(
      <RadioGroup variant="segmented" value="male" onValueChange={() => {}} aria-label="Gender">
        <RadioGroupItem value="male" label="Male" />
        <RadioGroupItem value="female" label="Female" />
      </RadioGroup>,
    )
    // State colours are applied as data-[state] variant utilities (present on
    // every item, activated by Radix's data-state attribute), so pinning the
    // class list pins the pill look regardless of which one is checked.
    const male = screen.getByRole('radio', { name: 'Male' })
    expect(male.className).toMatch(/rounded-lg/)
    expect(male.className).toMatch(/px-3/)
    expect(male.className).toMatch(/data-\[state=checked\]:bg-brand-500/)
    expect(male.className).toMatch(/data-\[state=unchecked\]:border-border/)
    // No radio-circle indicator in the segmented variant.
    expect(male.querySelector('span')).toBeNull()
  })

  it('selects on click anywhere on the pill', async () => {
    const onChange = vi.fn()
    render(
      <RadioGroup variant="segmented" value="" onValueChange={onChange} aria-label="Gender">
        <RadioGroupItem value="male" label="Male" />
        <RadioGroupItem value="female" label="Female" />
      </RadioGroup>,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Female' }))
    expect(onChange).toHaveBeenCalledWith('female')
  })

  it('is keyboard operable — Arrow moves roving focus, Space selects the focused pill', async () => {
    const onChange = vi.fn()
    render(
      <RadioGroup
        variant="segmented"
        value="male"
        onValueChange={onChange}
        orientation="horizontal"
        aria-label="Gender"
      >
        <RadioGroupItem value="male" label="Male" />
        <RadioGroupItem value="female" label="Female" />
      </RadioGroup>,
    )
    const male = screen.getByRole('radio', { name: 'Male' })
    const female = screen.getByRole('radio', { name: 'Female' })
    // ArrowRight moves roving focus to the next pill, and the roving tabindex
    // follows it — arrow keys (not Tab) move between options: the radio
    // semantics the raw <button> groups lacked. (In a real browser Radix also
    // selects on this focus; jsdom cannot replay select-on-focus, so the
    // selection half is pinned via Space below — the key a keyboard user
    // commits the choice with.)
    male.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(female).toHaveFocus()
    expect(female).toHaveAttribute('tabindex', '0')
    expect(male).toHaveAttribute('tabindex', '-1')
    // Space commits the selection of the focused pill.
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith('female')
  })

  it('supports a square `tile` size preset (e.g. a 1–5 rating scale)', () => {
    render(
      <RadioGroup variant="segmented" value="" onValueChange={() => {}} aria-label="Rating">
        <RadioGroupItem value="1" size="tile" label={1} aria-label="Rate 1 out of 5" />
      </RadioGroup>,
    )
    const tile = screen.getByRole('radio', { name: 'Rate 1 out of 5' })
    expect(tile.className).toMatch(/h-12/)
    expect(tile.className).toMatch(/w-12/)
    expect(tile).toHaveTextContent('1')
  })
})

describe('<Tabs />', () => {
  const Sut = ({ onValueChange = () => {} }: { onValueChange?: (v: string) => void }) => (
    <Tabs defaultValue="a" onValueChange={onValueChange}>
      <Tabs.List aria-label="Sections">
        <Tabs.Trigger value="a">Overview</Tabs.Trigger>
        <Tabs.Trigger value="b">Settings</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Panel value="a">Overview body</Tabs.Panel>
      <Tabs.Panel value="b">Settings body</Tabs.Panel>
    </Tabs>
  )

  it('shows the active panel and switches on click', async () => {
    render(<Sut />)
    expect(screen.getByText('Overview body')).toBeVisible()
    await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(screen.getByText('Settings body')).toBeVisible()
  })

  it('activates the next tab with ArrowRight (keyboard)', async () => {
    render(<Sut />)
    const first = screen.getByRole('tab', { name: 'Overview' })
    first.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('<Pagination />', () => {
  it('renders nothing when there is a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('marks the current page with aria-current and disables Previous at the first page', () => {
    render(<Pagination page={1} pageCount={5} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    expect(screen.getByRole('button', { current: 'page' })).toHaveTextContent('1')
  })

  it('requests the next page when Next is clicked', async () => {
    const onPage = vi.fn()
    render(<Pagination page={2} pageCount={5} onPageChange={onPage} />)
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onPage).toHaveBeenCalledWith(3)
  })
})

describe('<DataList />', () => {
  const cols = [{ key: 'name', header: 'Name' }] as const
  const rows = [{ id: '1', name: 'Ada' }, { id: '2', name: 'Grace' }]

  it('renders a semantic table (md+) with a column header and the rows', () => {
    render(<DataList columns={cols as never} rows={rows} rowKey={(r) => r.id} caption="People" />)
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    // rows appear in both the table and the mobile card list, so use getAllByText
    expect(screen.getAllByText('Ada').length).toBeGreaterThan(0)
  })

  it('activates a row on Enter AND Space via the keyboard (its bespoke handler)', async () => {
    const onRowClick = vi.fn()
    render(<DataList columns={cols as never} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} caption="People" />)
    const firstRow = screen.getAllByRole('row').find((r) => r.getAttribute('tabindex') === '0')!
    expect(firstRow).toBeTruthy()
    firstRow.focus()
    await userEvent.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledTimes(1)
    await userEvent.keyboard(' ')
    expect(onRowClick).toHaveBeenCalledTimes(2)
  })
})

describe('presentational primitives', () => {
  it('<Alert> renders role=alert with its title + body', () => {
    render(<Alert tone="red" title="Heads up">Something failed</Alert>)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Heads up')
    expect(alert).toHaveTextContent('Something failed')
  })

  it('<Badge> renders its content', () => {
    render(<Badge tone="green">Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('<Card> renders children', () => {
    render(<Card>panel body</Card>)
    expect(screen.getByText('panel body')).toBeInTheDocument()
  })

  it('<Stat> renders label + value', () => {
    render(<Stat label="Revenue" value="RM 12k" />)
    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.getByText('RM 12k')).toBeInTheDocument()
  })

  it('<Skeleton.Text> is an accessible busy status', () => {
    render(<Skeleton.Text lines={3} />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
  })
})
