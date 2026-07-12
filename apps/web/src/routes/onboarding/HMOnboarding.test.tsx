import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TFunction } from 'i18next'

// The wizard's data layer touches Supabase. Mock the exact module path the
// route file imports so nothing in the import graph tries to reach a network.
// (ReviewStep itself does not import supabase, but we mock defensively to keep
// this test hermetic and to mirror the route's '../../lib/supabase' path.)
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

import { headlineForPhase, progressPctForPhase, hmRestorePhase, type Phase } from './hm/helpers'
import ReviewStep from './hm/ReviewStep'

// A deterministic i18n stub: echoes the key, and substitutes {{dob}} /
// {{postcode}} interpolation so we can assert real, visible values without
// loading the i18n resource bundle.
const t = ((key: string, opts?: Record<string, unknown>) => {
  if (opts && typeof opts === 'object') {
    let out = key
    for (const [k, v] of Object.entries(opts)) {
      out = out.replace(`{{${k}}}`, String(v))
    }
    // i18n keys here carry no placeholders, so append the interpolated value
    // to keep it visible in the rendered output.
    if (opts.dob != null) return `${key}:${String(opts.dob)}`
    if (opts.postcode != null) return `${key}:${String(opts.postcode)}`
    return out
  }
  return key
}) as unknown as TFunction

describe('headlineForPhase (extracted pure helper)', () => {
  it('maps each phase to its headline key', () => {
    expect(headlineForPhase('basics', t)).toBe('hmOnboard.headlineBasics')
    expect(headlineForPhase('chat', t)).toBe('hmOnboard.headlineChat')
    expect(headlineForPhase('mustHaves', t)).toBe('hmOnboard.headlineMustHaves')
    expect(headlineForPhase('review', t)).toBe('hmOnboard.headlineReview')
  })

  it('returns an empty string for the terminal done phase', () => {
    expect(headlineForPhase('done', t)).toBe('')
  })
})

describe('progressPctForPhase (extracted pure helper)', () => {
  it('preserves the exact per-phase thresholds', () => {
    const cases: Array<[Phase, number]> = [
      ['basics', 5], ['chat', 40], ['mustHaves', 55], ['demographics', 68],
      ['hiringDetails', 78], ['dob', 88], ['review', 94], ['submit', 97], ['done', 100],
    ]
    for (const [phase, pct] of cases) {
      expect(progressPctForPhase(phase)).toBe(pct)
    }
  })
})

describe('hmRestorePhase (restore data-loss guard, onboarding-pii-2)', () => {
  it("routes a saved 'review' phase back to 'dob' (DOB/gender are never persisted)", () => {
    // Without this, restore lands on Review with an empty DOB and lets the user
    // submit, silently dropping the just-entered DOB + gender.
    expect(hmRestorePhase('review')).toBe('dob')
  })

  it('restores every other phase unchanged', () => {
    const passthrough: Phase[] = ['basics', 'chat', 'mustHaves', 'demographics', 'hiringDetails', 'dob', 'submit', 'done']
    for (const p of passthrough) {
      expect(hmRestorePhase(p)).toBe(p)
    }
  })
})

describe('<ReviewStep /> (extracted wizard sub-view)', () => {
  const baseProps = {
    t,
    dob: '1990-01-01',
    gender: 'male',
    dobSkipped: false,
    race: 'chinese',
    religion: 'buddhism',
    languages: ['english', 'mandarin'],
    locationMatters: false as boolean | null,
    locationPostcode: '',
    hmRequiresDrivingLicense: false,
    hmRequiresWeekends: false,
    hmRequiresTravel: false,
    hmRequiresNightShifts: false,
    hmRequiresRelocation: false,
    hmOnsiteOnly: false,
    hmRequiresOwnTransport: false,
    hmHasCommission: false,
    mustHaveItems: [] as string[],
    budgetApproved: 'yes',
    deadlineToFill: '',
    interviewRoundsHM: null as number | null,
    salaryFlex: null as boolean | null,
    failureAt90Days: '',
    err: null as string | null,
    busy: false,
    onBuild: () => {},
    onBack: () => {},
  }

  it('renders the build-profile primary action', () => {
    render(<ReviewStep {...baseProps} />)
    // The CTA label key is rendered by the stub t() verbatim.
    expect(screen.getAllByText('hmOnboard.buildProfile').length).toBeGreaterThan(0)
  })

  it('renders a summary row for each collected field', () => {
    render(<ReviewStep {...baseProps} />)
    expect(screen.getByText('hmOnboard.reviewChat')).toBeInTheDocument()
    expect(screen.getByText('hmOnboard.reviewGender')).toBeInTheDocument()
    // gender value is echoed straight through.
    expect(screen.getByText('male')).toBeInTheDocument()
  })

  it('shows the postcode threshold when office location matters', () => {
    render(<ReviewStep {...baseProps} locationMatters={true} locationPostcode="50450" />)
    // reviewPostcode carries the {{postcode}} placeholder; the stub appends it.
    expect(screen.getByText('hmOnboard.reviewPostcode:50450')).toBeInTheDocument()
  })

  it('renders the active role-constraint summary when a constraint is set', () => {
    render(<ReviewStep {...baseProps} hmRequiresWeekends={true} />)
    // The constraints row joins active constraint labels; the weekends key is present.
    expect(screen.getByText('hmOnboard.reviewConstraintWeekends')).toBeInTheDocument()
  })

  it('omits the optional deadline row when no deadline is set', () => {
    render(<ReviewStep {...baseProps} deadlineToFill="" />)
    expect(screen.queryByText('hmOnboard.reviewDeadline')).not.toBeInTheDocument()
  })
})
