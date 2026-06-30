import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CandidateCard from './hm/CandidateCard'
import type { CandidateRow, FeedbackEntry } from './hm/types'

// react-i18next is not initialized in the test env. Mock it so `t(key)`
// returns the key verbatim — assertions stay deterministic regardless of
// whether the real i18n bundle has loaded.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// CandidateCard does not call supabase directly, but the sibling hook does and
// the task asks the supabase module to be mocked. Mock it defensively so no
// transitive import can reach a live client during the render smoke.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async () => ({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}))

const baseRow: CandidateRow = {
  id: 'match-1',
  compatibility_score: 82,
  status: 'generated',
  is_urgent: false,
  public_reasoning: null,
  application_summary: null,
  talents: {
    id: 'talent-1',
    privacy_mode: 'anonymous',
    derived_tags: null,
    expected_salary_min: 4000,
    expected_salary_max: 6000,
  },
  roles: { id: 'role-1', title: 'Senior Goldsmith' },
  match_feedback: null,
}

const feedbackEntry: FeedbackEntry = {
  rating: 0, hired: false, notes: '', outcome: '', freeText: '', saving: false, saved: false,
}

function renderCard(overrides: Partial<React.ComponentProps<typeof CandidateCard>> = {}) {
  const noop = () => {}
  return render(
    <MemoryRouter>
      <CandidateCard
        row={baseRow}
        rounds={[]}
        pendingProposal={null}
        preview={null}
        contact={undefined}
        actionBusy={null}
        schedulingFor={null}
        companyVerified={true}
        companyId={null}
        onInvite={noop}
        onDecline={noop}
        onScheduleRound={noop}
        onCancelProposal={noop}
        onCompleteInterviews={noop}
        onMakeOffer={noop}
        onMarkHired={noop}
        onCancel={noop}
        onRevealContact={noop}
        onViewResume={noop}
        feedbackEntry={feedbackEntry}
        onFeedbackChange={noop}
        onFeedbackSubmit={noop}
        {...overrides}
      />
    </MemoryRouter>,
  )
}

describe('<CandidateCard /> (HM dashboard sub-view)', () => {
  it('renders the rounded match percentage and the role title', () => {
    renderCard()
    // pct = Math.round(82) — surfaced via the i18n key + interpolation, which
    // our mock returns as the bare key. Assert the structural pieces render.
    expect(screen.getByText('hmDash.pctMatch')).toBeInTheDocument()
    expect(screen.getByText('hmDash.forRole')).toBeInTheDocument()
  })

  it('shows the expected-salary block (RM 4,000 – 6,000)', () => {
    renderCard()
    expect(screen.getByText('hmDash.expects')).toBeInTheDocument()
    // fmt renders en-locale grouped numbers; assert both bounds are present.
    expect(screen.getByText(/4,000/)).toBeInTheDocument()
    expect(screen.getByText(/6,000/)).toBeInTheDocument()
  })

  it('GATING: invite + view-resume are enabled when the company is verified', () => {
    renderCard({ companyVerified: true })
    expect(screen.getByText('hmDash.inviteToInterview').closest('button')).not.toBeDisabled()
    expect(screen.getByText('hmDash.viewResume').closest('button')).not.toBeDisabled()
  })

  it('GATING: invite + view-resume are disabled when the company is unverified (companyVerified === false)', () => {
    renderCard({ companyVerified: false })
    // companyLocked = companyVerified === false → both gated buttons disable.
    expect(screen.getByText('hmDash.inviteToInterview').closest('button')).toBeDisabled()
    expect(screen.getByText('hmDash.viewResume').closest('button')).toBeDisabled()
  })

  it('renders the urgent badge only when the row is flagged urgent', () => {
    const { rerender } = renderCard({ row: { ...baseRow, is_urgent: false } })
    expect(screen.queryByText('hmDash.urgentMatchBadge')).not.toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <CandidateCard
          row={{ ...baseRow, is_urgent: true }}
          rounds={[]} pendingProposal={null} preview={null} contact={undefined}
          actionBusy={null} schedulingFor={null} companyVerified={true} companyId={null}
          onInvite={() => {}} onDecline={() => {}} onScheduleRound={() => {}}
          onCancelProposal={() => {}} onCompleteInterviews={() => {}} onMakeOffer={() => {}}
          onMarkHired={() => {}} onCancel={() => {}} onRevealContact={() => {}} onViewResume={() => {}}
          feedbackEntry={feedbackEntry} onFeedbackChange={() => {}} onFeedbackSubmit={() => {}}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('hmDash.urgentMatchBadge')).toBeInTheDocument()
  })

  it('shows the contact-reveal button once an offer is made, with the offer/hired gate', () => {
    renderCard({ row: { ...baseRow, status: 'offer_made' }, contact: undefined })
    const block = screen.getByText('hmDash.contactDetails').closest('div') as HTMLElement
    expect(within(block).getByText('hmDash.revealContact')).toBeInTheDocument()
  })
})
