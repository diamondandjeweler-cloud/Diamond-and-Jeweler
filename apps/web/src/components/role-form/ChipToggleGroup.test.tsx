import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChipToggleGroup } from './index'

// role-form/index.tsx touches the supabase module at import time (callFunction /
// skillTaxonomy). ChipToggleGroup itself does not, but mock supabase defensively
// — exactly as PostRole.test.tsx does — so the transitive import can't reach a
// live client during render.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async () => ({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}))

const OPTIONS = [
  { slug: 'day', label: 'Day' },
  { slug: 'night', label: 'Night' },
  { slug: 'rotating', label: 'Rotating' },
] as const

describe('<ChipToggleGroup />', () => {
  it('renders one pill button per option with the shared pill classes', () => {
    render(<ChipToggleGroup value={[]} onChange={() => {}} options={OPTIONS} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    // Every pill carries the byte-identical base classes.
    for (const b of buttons) {
      expect(b).toHaveAttribute('type', 'button')
      expect(b.className).toContain('rounded-full')
      expect(b.className).toContain('px-3 py-1.5')
    }
    expect(screen.getByText('Day')).toBeInTheDocument()
    expect(screen.getByText('Night')).toBeInTheDocument()
  })

  it('applies the active class set only to selected slugs', () => {
    render(<ChipToggleGroup value={['night']} onChange={() => {}} options={OPTIONS} />)
    const night = screen.getByText('Night').closest('button')!
    const day = screen.getByText('Day').closest('button')!
    expect(night.className).toContain('bg-ink-900 text-white border-ink-900')
    expect(day.className).toContain('bg-white text-ink-700 border-ink-200')
    expect(day.className).not.toContain('bg-ink-900')
  })

  it('toggles a slug ON when an unselected pill is clicked', () => {
    const onChange = vi.fn()
    render(<ChipToggleGroup value={['day']} onChange={onChange} options={OPTIONS} />)
    fireEvent.click(screen.getByText('Night'))
    expect(onChange).toHaveBeenCalledWith(['day', 'night'])
  })

  it('toggles a slug OFF when an already-selected pill is clicked', () => {
    const onChange = vi.fn()
    render(<ChipToggleGroup value={['day', 'night']} onChange={onChange} options={OPTIONS} />)
    fireEvent.click(screen.getByText('Day'))
    expect(onChange).toHaveBeenCalledWith(['night'])
  })

  it('renders optional label, hint and footer', () => {
    render(
      <ChipToggleGroup
        value={[]}
        onChange={() => {}}
        options={OPTIONS}
        label="Shifts"
        hint="Pick any"
        footer={<div className="italic">Empty = no restriction</div>}
      />,
    )
    const label = screen.getByText('Shifts')
    expect(label.className).toContain('field-label')
    const hint = screen.getByText('Pick any')
    expect(hint.className).toContain('field-hint')
    expect(screen.getByText('Empty = no restriction')).toBeInTheDocument()
  })

  it('omits label/hint/footer when not provided (no field-label node)', () => {
    const { container } = render(
      <ChipToggleGroup value={[]} onChange={() => {}} options={OPTIONS} />,
    )
    expect(container.querySelector('.field-label')).toBeNull()
    expect(container.querySelector('.field-hint')).toBeNull()
  })
})
