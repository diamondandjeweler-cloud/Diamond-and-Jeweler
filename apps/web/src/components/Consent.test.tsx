import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Consent from './Consent'

describe('<Consent />', () => {
  it('renders the label', () => {
    render(<Consent checked={false} onChange={() => {}} label="Agree to terms" />)
    expect(screen.getByText('Agree to terms')).toBeInTheDocument()
  })

  it('shows required marker when `required`', () => {
    render(<Consent checked={false} onChange={() => {}} label="X" required />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('fires onChange(true) when the checkbox is clicked', async () => {
    const onChange = vi.fn()
    render(<Consent checked={false} onChange={onChange} label="Y" />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('reflects `checked` prop', () => {
    render(<Consent checked={true} onChange={() => {}} label="Z" />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
