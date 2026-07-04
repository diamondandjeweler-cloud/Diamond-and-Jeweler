import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, Input } from './ui'

afterEach(cleanup)

describe('<Button />', () => {
  it('applies the variant class and forwards clicks', async () => {
    const onClick = vi.fn()
    render(
      <Button variant="brand" onClick={onClick}>
        Save
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.className).toContain('btn-brand')
    await userEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled and busy while loading', () => {
    render(<Button loading>Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('asChild renders the child element (a link) with button styling', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/pricing">Pricing</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Pricing' })
    expect(link).toHaveAttribute('href', '/pricing')
    expect(link.className).toContain('btn-secondary')
    // No extra <button> wrapper — Slot merged onto the anchor.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('<Input /> — accessible Field wiring (P0)', () => {
  it('associates the error with the control via aria-invalid + aria-errormessage', () => {
    render(<Input label="Email" error="Required" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const errId = input.getAttribute('aria-errormessage')
    expect(errId).toBeTruthy()
    expect(document.getElementById(errId!)).toHaveTextContent('Required')
    expect(input.getAttribute('aria-describedby')).toContain(errId!)
  })

  it('associates the hint via aria-describedby when there is no error', () => {
    render(<Input label="Name" hint="Your full name" />)
    const input = screen.getByLabelText('Name')
    expect(input).not.toHaveAttribute('aria-invalid')
    const descId = input.getAttribute('aria-describedby')
    expect(descId).toBeTruthy()
    expect(document.getElementById(descId!)).toHaveTextContent('Your full name')
  })
})
