import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * frontend-broad-1: the payment-return screen must not tell a paying customer
 * "We couldn't confirm your booking" while the (independent) booking-status read
 * is still in flight, nor when that read errors/returns no row. The red
 * couldNotConfirm alert is reserved for a LOADED, genuinely-unpaid status.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams('booking_id=b1'), vi.fn()],
}))

vi.mock('../lib/useSeo', () => ({ useSeo: () => {} }))

const callFunction = vi.fn()
vi.mock('../lib/functions', () => ({ callFunction: (...a: unknown[]) => callFunction(...a) }))

const consultBookingStatusById = vi.fn()
vi.mock('../data/repositories/consults', () => ({
  consultBookingStatusById: (...a: unknown[]) => consultBookingStatusById(...a),
}))

const getConfigValues = vi.fn()
vi.mock('../data/repositories/systemConfig', () => ({
  getConfigValues: (...a: unknown[]) => getConfigValues(...a),
}))

import Consult from './Consult'

beforeEach(() => {
  vi.clearAllMocks()
  // Tier config resolves immediately so the page clears its own `loading` gate
  // and reaches the return card while the booking-status read is what we control.
  getConfigValues.mockResolvedValue({ data: [] })
})

describe('<Consult /> — payment-return confirmation state (frontend-broad-1)', () => {
  it('does NOT show the red couldNotConfirm while the booking status is still loading', async () => {
    consultBookingStatusById.mockReturnValue(new Promise(() => {})) // never resolves
    render(<Consult />)
    await screen.findByText('consult.thanksTitle')
    expect(screen.queryByText('consult.couldNotConfirm')).toBeNull()
    expect(screen.queryByText('consult.confirmRetry')).toBeNull()
  })

  it('shows a neutral retry message (NOT couldNotConfirm) when the status read returns no row', async () => {
    consultBookingStatusById.mockResolvedValue({ data: null, error: null })
    render(<Consult />)
    await screen.findByText('consult.confirmRetry')
    expect(screen.queryByText('consult.couldNotConfirm')).toBeNull()
  })

  it('shows a neutral retry message (NOT couldNotConfirm) when the status read errors', async () => {
    consultBookingStatusById.mockResolvedValue({ data: null, error: { message: 'boom' } })
    render(<Consult />)
    await screen.findByText('consult.confirmRetry')
    expect(screen.queryByText('consult.couldNotConfirm')).toBeNull()
  })

  it('shows the paid confirmation for a paid booking', async () => {
    consultBookingStatusById.mockResolvedValue({ data: { status: 'paid', video_url: null }, error: null })
    render(<Consult />)
    await screen.findByText('consult.paid')
    expect(screen.queryByText('consult.couldNotConfirm')).toBeNull()
  })

  it('still shows the red couldNotConfirm for a LOADED, genuinely-unpaid status', async () => {
    consultBookingStatusById.mockResolvedValue({ data: { status: 'cancelled', video_url: null }, error: null })
    render(<Consult />)
    await screen.findByText('consult.couldNotConfirm')
  })
})
