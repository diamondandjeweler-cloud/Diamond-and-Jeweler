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

// i18n stub: every visible string flows through t(), so the rendered text IS the
// key (with n/role interpolation appended). This both keeps the behaviour
// assertions deterministic AND proves the copy is localized (secrecy-a11y-inj-4):
// a hard-coded-English component could never render 'feedback.title' etc.
//
// `t` MUST be referentially stable (hoisted, created once) — the component's load
// effect lists `t` in its deps, mirroring production react-i18next where `t` is
// memoized; a fresh `t` per render would re-fire the effect forever (hang).
const { stableT } = vi.hoisted(() => ({
  stableT: (k: string, opts?: Record<string, unknown>) => {
    let s = k
    if (opts?.n != null) s += `:${String(opts.n)}`
    if (opts?.role != null) s += `:${String(opts.role)}`
    return s
  },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: stableT, i18n: { language: 'en' } }),
}))

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
    // Wait for the async match/interview load to resolve into the form. The
    // radiogroup is labelled by the localized rating question key.
    const group = await screen.findByRole('radiogroup', { name: 'feedback.ratingQuestion' })
    expect(group).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(5)
    for (const r of radios) expect(r).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'feedback.rateAria:3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'feedback.submit' })).toBeDisabled()
  })

  it('selecting a rating checks it and enables Submit (selection behaviour preserved)', async () => {
    renderFeedback()
    const four = await screen.findByRole('radio', { name: 'feedback.rateAria:4' })
    await userEvent.click(four)
    expect(four).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'feedback.rateAria:3' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'feedback.submit' })).toBeEnabled()
  })

  it('localizes every visible string through t() (secrecy-a11y-inj-4)', async () => {
    renderFeedback()
    // Heading, rating question and role line all come from the feedback.* keys —
    // a hard-coded-English render could never produce these key strings.
    expect(await screen.findByText('feedback.title')).toBeInTheDocument()
    expect(screen.getByText('feedback.ratingQuestion')).toBeInTheDocument()
    // role line interpolates the fetched title ('Head Chef').
    expect(screen.getByText(/feedback\.role/)).toHaveTextContent('Head Chef')
    expect(screen.getByRole('button', { name: 'feedback.back' })).toBeInTheDocument()
  })

  it('keeps the exact rating-tile styling — brand-600 fill on a white/gray-200 tile (parity)', async () => {
    renderFeedback()
    const tile = await screen.findByRole('radio', { name: 'feedback.rateAria:1' })
    expect(tile.className).toMatch(/h-12/)
    expect(tile.className).toMatch(/w-12/)
    expect(tile.className).toMatch(/data-\[state=checked\]:bg-brand-600/)
    expect(tile.className).toMatch(/data-\[state=unchecked\]:bg-white/)
    expect(tile.className).toMatch(/data-\[state=unchecked\]:border-gray-200/)
    // Visible content is still the digit (aria-label supplies the spoken name).
    expect(tile).toHaveTextContent('1')
  })
})
