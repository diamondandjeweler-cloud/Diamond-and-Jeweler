import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

/**
 * frontend-broad-2: while a Diamond-Points purchase is in flight, EVERY buy
 * button must be disabled so a second package click cannot fire a second
 * buy-points POST (a duplicate/orphaned Billplz bill). Before the fix only the
 * clicked package's button was disabled; a sibling stayed live during the
 * network round-trip that ends in window.location.assign.
 */

const fakeSession = { user: { id: 'u1' }, access_token: 'tok' }
const fakeProfile = { points: 0, points_earned_total: 0 }

vi.mock('../state/useSession', () => ({
  useSession: (selector: (s: unknown) => unknown) =>
    selector({ session: fakeSession, profile: fakeProfile, refresh: () => {} }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts && 'rm' in opts ? `${k}:${String(opts.rm)}` : k,
  }),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock('../lib/useSeo', () => ({ useSeo: () => {} }))

vi.mock('../data/repositories/points', () => ({
  pointTransactionsForUser: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock('../data/repositories/systemConfig', () => ({
  getConfigValue: vi.fn().mockResolvedValue({
    data: {
      value: [
        { id: 'a', name: 'Starter', price_rm: 9.9, points: 21 },
        { id: 'b', name: 'Pro', price_rm: 19.9, points: 50 },
      ],
    },
  }),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}))

import PointsWallet from './PointsWallet'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  // In-flight purchase: the fetch never resolves, so buyingId stays set and the
  // component sits in its "purchase in progress" state for the assertions.
  fetchMock = vi.fn(() => new Promise(() => {}))
  vi.stubGlobal('fetch', fetchMock)
})

describe('<PointsWallet /> — buy double-submit guard', () => {
  it('disables ALL buy buttons and fires exactly one POST while a purchase is in flight', async () => {
    render(<PointsWallet />)

    const buyA = await screen.findByRole('button', { name: 'points.buyButton:9.90' })
    // Sibling package button starts enabled.
    expect(screen.getByRole('button', { name: 'points.buyButton:19.90' })).not.toBeDisabled()

    await userEvent.click(buyA)

    // Package A is now loading; package B must be collectively disabled.
    await screen.findByRole('button', { name: 'points.buying' })
    expect(screen.getByRole('button', { name: 'points.buyButton:19.90' })).toBeDisabled()

    // Only ONE buy-points request went out.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/buy-points'),
      expect.objectContaining({ body: JSON.stringify({ package_id: 'a' }) }),
    )
  })
})
