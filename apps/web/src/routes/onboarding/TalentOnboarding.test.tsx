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

import { computeUsesLunarCalendar } from './talent/helpers'
import ReviewStep from './talent/ReviewStep'

// A deterministic i18n stub: echoes the key, and substitutes {{amount}} /
// {{dob}} interpolation so we can assert real, visible values without loading
// the i18n resource bundle.
const t = ((key: string, opts?: Record<string, unknown>) => {
  if (opts && typeof opts === 'object') {
    let out = key
    for (const [k, v] of Object.entries(opts)) {
      out = out.replace(`{{${k}}}`, String(v))
    }
    // i18n keys here carry no placeholders, so append the interpolated value
    // to keep it visible in the rendered output.
    if (opts.amount != null) return `${key}:${String(opts.amount)}`
    if (opts.dob != null) return `${key}:${String(opts.dob)}`
    return out
  }
  return key
}) as unknown as TFunction

describe('computeUsesLunarCalendar (extracted pure helper)', () => {
  it('is true for a Chinese, Buddhist, Mandarin speaker', () => {
    expect(computeUsesLunarCalendar('chinese', 'buddhism', ['mandarin'])).toBe(true)
  })

  it('is false when race is not chinese', () => {
    expect(computeUsesLunarCalendar('malay', 'buddhism', ['mandarin'])).toBe(false)
  })

  it('is false when religion is outside the lunar set', () => {
    expect(computeUsesLunarCalendar('chinese', 'christianity', ['mandarin'])).toBe(false)
  })

  it('is false when no qualifying language is spoken', () => {
    expect(computeUsesLunarCalendar('chinese', 'taoism', ['english'])).toBe(false)
  })
})

describe('<ReviewStep /> (extracted wizard sub-view)', () => {
  const baseProps = {
    t,
    dob: '1990-01-01',
    gender: 'male',
    race: 'chinese',
    religion: 'buddhism',
    languages: ['english', 'mandarin'],
    locationMatters: false as boolean | null,
    locationPostcode: '',
    noWeekendWork: false,
    noDrivingLicense: false,
    noTravel: false,
    noNightShifts: false,
    noOwnCar: false,
    remoteOnly: false,
    noRelocation: false,
    noOvertime: false,
    noCommissionOnly: false,
    minSalaryHard: null as number | null,
    photoFile: null as File | null,
    resumeFile: null as File | null,
    coverLetterFile: null as File | null,
    err: null as string | null,
    busy: false,
    onBuild: () => {},
    onBack: () => {},
  }

  it('renders the build-profile primary action', () => {
    render(<ReviewStep {...baseProps} />)
    // The CTA label key is rendered by the stub t() verbatim.
    expect(screen.getAllByText('talentOnboard.buildMyProfile').length).toBeGreaterThan(0)
  })

  it('renders a summary row for each collected field', () => {
    render(<ReviewStep {...baseProps} />)
    expect(screen.getByText('talentOnboard.reviewChat')).toBeInTheDocument()
    expect(screen.getByText('talentOnboard.reviewGender')).toBeInTheDocument()
    // chinese gender/race values are echoed straight through.
    expect(screen.getByText('male')).toBeInTheDocument()
  })

  it('surfaces the hard minimum-salary gating threshold when set', () => {
    render(<ReviewStep {...baseProps} minSalaryHard={5000} />)
    // minSalaryHard.toLocaleString() => "5,000"; the stub appends it to the key.
    expect(screen.getByText('talentOnboard.reviewMinSalaryValue:5,000')).toBeInTheDocument()
  })

  it('omits the minimum-salary row when no threshold is set', () => {
    render(<ReviewStep {...baseProps} minSalaryHard={null} />)
    expect(screen.queryByText('talentOnboard.reviewMinSalary')).not.toBeInTheDocument()
  })
})
