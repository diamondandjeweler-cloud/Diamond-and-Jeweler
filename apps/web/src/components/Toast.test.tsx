import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from './Toast'

afterEach(cleanup)

function Harness() {
  const toast = useToast()
  return (
    <div>
      <button onClick={() => toast.success('Saved!')}>ok</button>
      <button onClick={() => toast.error('Failed!')}>fail</button>
    </div>
  )
}

describe('Toast', () => {
  it('shows a success toast on demand', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'ok' }))
    expect(await screen.findByText('Saved!')).toBeInTheDocument()
  })

  it('announces errors assertively via role="alert"', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'fail' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Failed!')
  })

  it('dismisses a toast via its close button', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'ok' }))
    expect(await screen.findByText('Saved!')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    await waitFor(() => expect(screen.queryByText('Saved!')).not.toBeInTheDocument())
  })

  it('exposes notifications through a labelled live region', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'ok' }))
    const region = await screen.findByRole('region', { name: 'Notifications' })
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('throws if useToast is used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Harness />)).toThrow(/ToastProvider/)
    spy.mockRestore()
  })
})
