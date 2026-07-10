import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Avatar } from './Avatar'
import { Switch } from './Switch'
import { Checkbox } from './Checkbox'
import { RadioGroup, RadioGroupItem } from './RadioGroup'
import { Tabs } from './Tabs'
import { Pagination } from './Pagination'

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
  it('exposes role=switch, reflects checked, and toggles via keyboard/click', async () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onChange} label="Email alerts" />)
    const sw = screen.getByRole('switch', { name: 'Email alerts' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('<Checkbox />', () => {
  it('exposes role=checkbox and fires onCheckedChange(true) when toggled', async () => {
    const onChange = vi.fn()
    render(<Checkbox checked={false} onCheckedChange={onChange} label="I agree" />)
    const cb = screen.getByRole('checkbox', { name: 'I agree' })
    await userEvent.click(cb)
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
})

describe('<Tabs />', () => {
  it('shows the active panel and switches when another tab is activated', async () => {
    render(
      <Tabs defaultValue="a">
        <Tabs.List aria-label="Sections">
          <Tabs.Trigger value="a">Overview</Tabs.Trigger>
          <Tabs.Trigger value="b">Settings</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Panel value="a">Overview body</Tabs.Panel>
        <Tabs.Panel value="b">Settings body</Tabs.Panel>
      </Tabs>,
    )
    expect(screen.getByText('Overview body')).toBeVisible()
    await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(screen.getByText('Settings body')).toBeVisible()
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
    const current = screen.getByRole('button', { current: 'page' })
    expect(current).toHaveTextContent('1')
  })

  it('requests the next page when Next is clicked', async () => {
    const onPage = vi.fn()
    render(<Pagination page={2} pageCount={5} onPageChange={onPage} />)
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onPage).toHaveBeenCalledWith(3)
  })
})
