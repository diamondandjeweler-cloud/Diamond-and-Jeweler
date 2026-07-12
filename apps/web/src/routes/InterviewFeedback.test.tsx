/**
 * Characterization test for the interview-feedback rating single-select.
 *
 * InterviewFeedback had no test; this pins the BEHAVIOUR that must survive the
 * RadioGroup(segmented) adoption of the 1–5 rating: five options, nothing
 * selected initially (Submit disabled), picking one selects it and enables
 * Submit, and the tiles keep their exact look (brand-600 fill on a legacy
 * `bg-white` card — parity beats purity) while gaining real radio semantics.
 *
 * The page loads match/interview/ownership before the form appears, so the
 * data layer + session + router are mocked to reach the rating step.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// A STABLE session object — the component reads it through `useShallow`, whose
// shallow compare is on `state.session`; returning a fresh object each render
// would flip the identity every render and re-fire the `[matchId, session]`
// effect forever (infinite render loop). vi.hoisted keeps the ref module-stable.
const { SESSION } = vi.hoisted(() => ({ SESSION: { session: { user: { id: 'u1' } } } }))
vi.mock('../state/useSession', () => ({
  useSession: (selector: (s: typeof SESSION) => unknown) => selector(SESSION),
}))
vi.mock('../data/repositories/matches', () => ({
  matchForFeedback: () => ({
    single: () =>
      Promise.resolve({
        data: { status: 'interview_scheduled', talent_id: 't1', roles: { title: 'Head Chef', hiring_manager_id: 'hm1' } },
        error: null,
      }),
  }),
}))
vi.mock('../data/repositories/interviews', () => ({
  interviewFeedbackFlagsByMatch: () => ({
    maybeSingle: () => Promise.resolve({ data: { id: 'iv1', feedback_talent: null, feedback_manager: null } }),
  }),
  updateInterview: vi.fn(() => Promise.resolve({ error: null })),
  insertFeedbackSubmission: vi.fn(() => Promise.resolve({ error: null })),
}))
vi.mock('../data/repositories/talents', () => ({
  talentOwnershipById: () => Promise.resolve({ data: { profile_id: 'u1' } }),
}))
vi.mock('../data/repositories/hiringManagers', () => ({
  hmProfileLinkById: () => Promise.resolve({ data: null }),
}))
vi.mock('../data/repositories/points', () => ({
  awardPoints: vi.fn(() => Promise.resolve({})),
}))

import InterviewFeedback from './InterviewFeedback'

afterEach(cleanup)

function renderFeedback() {
  return render(
    <MemoryRouter initialEntries={['/feedback/m1']}>
      <Routes>
        <Route path="/feedback/:matchId" element={<InterviewFeedback />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('<InterviewFeedback /> rating — RadioGroup(segmented) adoption', () => {
  it('renders the 1–5 rating as five radios, nothing selected, Submit disabled', async () => {
    renderFeedback()
    // Wait for the async match/interview load to resolve into the form.
    const group = await screen.findByRole('radiogroup', { name: /how did it go/i })
    expect(group).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(5)
    for (const r of radios) expect(r).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Rate 3 out of 5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit feedback/i })).toBeDisabled()
  })

  it('selecting a rating checks it and enables Submit (selection behaviour preserved)', async () => {
    renderFeedback()
    const four = await screen.findByRole('radio', { name: 'Rate 4 out of 5' })
    await userEvent.click(four)
    expect(four).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Rate 3 out of 5' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: /submit feedback/i })).toBeEnabled()
  })

  it('keeps the exact rating-tile styling — brand-600 fill on a white/gray-200 tile (parity)', async () => {
    renderFeedback()
    const tile = await screen.findByRole('radio', { name: 'Rate 1 out of 5' })
    expect(tile.className).toMatch(/h-12/)
    expect(tile.className).toMatch(/w-12/)
    expect(tile.className).toMatch(/data-\[state=checked\]:bg-brand-600/)
    expect(tile.className).toMatch(/data-\[state=unchecked\]:bg-white/)
    expect(tile.className).toMatch(/data-\[state=unchecked\]:border-gray-200/)
    // Visible content is still the digit (aria-label supplies the spoken name).
    expect(tile).toHaveTextContent('1')
  })
})
