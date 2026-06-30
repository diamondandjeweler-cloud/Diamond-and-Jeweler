import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Deterministic i18n: t(key) returns the key (with interpolated values appended
// when present), so assertions don't depend on bundle/i18n initialisation.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars && Object.keys(vars).length ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}))

// Belt-and-braces: even though the extracted sub-view under test does not touch
// supabase, the route module path is mocked per task spec so importing anything
// from the talent folder transitively never hits a real client.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}))

import { OfferCard } from './talent/OfferCard'
import { computeProfileGaps } from './talent/types'
import type { MatchRow } from './talent/types'

describe('computeProfileGaps (pure helper extracted into the data hook layer)', () => {
  it('reports every gap key for a fully-empty talent row (12 tracked fields)', () => {
    const gaps = computeProfileGaps({})
    // All twelve completeness fields are missing → twelve gap keys.
    expect(gaps).toHaveLength(12)
    expect(gaps).toContain('talentDash.gapEmploymentStatus')
    expect(gaps).toContain('talentDash.gapNoticePeriod')
  })

  it('treats 0 as a present numeric value (== null gate, not falsy gate)', () => {
    // current_salary: 0 must NOT be flagged as a gap — the original code uses
    // `== null`, so a real zero salary counts as filled. Guards the gating math.
    const gaps = computeProfileGaps({ current_salary: 0, expected_salary_min: 0, notice_period_days: 0, has_noncompete: false })
    expect(gaps).not.toContain('talentDash.gapCurrentSalary')
    expect(gaps).not.toContain('talentDash.gapExpectedSalary')
    expect(gaps).not.toContain('talentDash.gapNoticePeriod')
    expect(gaps).not.toContain('talentDash.gapNonCompete')
  })

  it('flags an empty employment_type_preferences array as a gap', () => {
    expect(computeProfileGaps({ employment_type_preferences: [] })).toContain('talentDash.gapEmploymentType')
    expect(computeProfileGaps({ employment_type_preferences: ['full_time'] })).not.toContain('talentDash.gapEmploymentType')
  })
})

const baseMatch: MatchRow = {
  id: 'match-1',
  compatibility_score: 87,
  status: 'generated',
  expires_at: null,
  public_reasoning: null,
  application_summary: null,
  roles: {
    id: 'role-1',
    title: 'Senior Goldsmith',
    description: 'Bench jeweller role',
    salary_min: 4000,
    salary_max: 6000,
    location: 'Kuala Lumpur',
    work_arrangement: 'onsite',
  },
}

function renderOfferCard(overrides: Partial<React.ComponentProps<typeof OfferCard>> = {}) {
  return render(
    <MemoryRouter>
      <OfferCard
        m={baseMatch}
        rounds={[]}
        pendingProposal={null}
        actionBusy={null}
        respond={() => {}}
        onAcceptOffer={() => {}}
        onDeclineOffer={() => {}}
        onPickSlot={() => {}}
        onDeclineProposal={() => {}}
        feedbackEntry={{ rating: 0, outcome: '', freeText: '', saving: false, saved: false }}
        onFeedbackChange={() => {}}
        onFeedbackSubmit={() => {}}
        {...overrides}
      />
    </MemoryRouter>,
  )
}

describe('<OfferCard /> (largest extracted presentational sub-view)', () => {
  it('renders the role title and location', () => {
    renderOfferCard()
    expect(screen.getByText('Senior Goldsmith')).toBeInTheDocument()
    expect(screen.getByText('Kuala Lumpur')).toBeInTheDocument()
  })

  it('renders the rounded compatibility ring value (gating threshold visual)', () => {
    // 87 stays 87; verifies the Math.round(compatibility_score) path renders.
    renderOfferCard()
    expect(screen.getByText('87')).toBeInTheDocument()
  })

  it('renders the salary band block with the per-month suffix', () => {
    const { container } = renderOfferCard()
    // The salary figures are interpolated across several text nodes inside one
    // <span>, so assert against the container's combined textContent — tolerant
    // of whatever thousands separator the test runner's locale inserts.
    expect(container.textContent ?? '').toMatch(/RM\s*4[,.]?000\s*–\s*6[,.]?000/)
    // The standalone per-month suffix is its own text node.
    expect(screen.getByText(/talentDash\.perMonth/)).toBeInTheDocument()
  })

  it('omits the salary block entirely when both bounds are null', () => {
    renderOfferCard({ m: { ...baseMatch, roles: { ...baseMatch.roles!, salary_min: null, salary_max: null } } })
    expect(screen.queryByText(/talentDash\.perMonth/)).toBeNull()
  })
})
