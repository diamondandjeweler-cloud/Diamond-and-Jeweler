import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal, ConfirmModal } from './Modal'

afterEach(cleanup)

describe('<Modal />', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={() => {}} title="Hidden">body</Modal>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })

  it('renders title + children as an accessible dialog when open', () => {
    render(
      <Modal open onClose={() => {}} title="Delete item">
        Are you sure?
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Delete item')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    // Title is wired as the accessible label.
    expect(dialog).toHaveAttribute('aria-labelledby')
  })

  it('moves focus into the panel on open (focus trap entry)', async () => {
    render(
      <Modal
        open
        onClose={() => {}}
        title="With button"
        footer={<button>Confirm</button>}
      >
        body
      </Modal>,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus(),
    )
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Esc">body</Modal>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Backdrop">body</Modal>)
    // The backdrop is the dialog's parent (the fixed overlay).
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement
    await userEvent.pointer({ target: backdrop, keys: '[MouseLeft]' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT close when clicking inside the panel', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Inside">tap me</Modal>)
    await userEvent.click(screen.getByText('tap me'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('respects dismissable=false (Escape + backdrop do nothing)', async () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Locked" dismissable={false}>body</Modal>)
    await userEvent.keyboard('{Escape}')
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement
    await userEvent.pointer({ target: backdrop, keys: '[MouseLeft]' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('<ConfirmModal />', () => {
  it('renders message + confirm/cancel and wires the callbacks', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmModal
        open
        onConfirm={onConfirm}
        onCancel={onCancel}
        title="Redeem points?"
        message="This costs 21 Diamond Points."
        confirmLabel="Redeem"
      />,
    )
    expect(screen.getByText('This costs 21 Diamond Points.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Redeem' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('notice mode shows a single acknowledge button (no Cancel)', () => {
    render(
      <ConfirmModal
        open
        notice
        onConfirm={() => {}}
        onCancel={() => {}}
        title="Heads up"
        message="Done."
      />,
    )
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })
})
