import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HowItWorksSection, SocialProofStrip } from './landing/sections'

// react-i18next is not initialized in the test env. Mock it so `t(key)`
// returns the key verbatim — assertions stay deterministic regardless of
// whether the real i18n bundle has loaded. (Same pattern as
// routes/dashboard/HMDashboard.test.tsx.)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// SocialProofStrip calls usePlatformStats(), which fires a real `fetch('/api/stats')`.
// Mock it so the render smoke is deterministic and offline-safe: returning null
// labels exercises the documented fallback branch (companyLabel/talentLabel === null
// → the *Fallback i18n keys render). Default mock = both null.
const platformStats = vi.fn(() => ({
  stats: null as unknown,
  talentLabel: null as string | null,
  companyLabel: null as string | null,
}))
vi.mock('../lib/usePlatformStats', () => ({
  usePlatformStats: () => platformStats(),
}))

describe('Landing — extracted below-the-fold sub-views (characterization)', () => {
  it('HowItWorksSection renders its heading and the three-step structure', () => {
    render(
      <MemoryRouter>
        <HowItWorksSection />
      </MemoryRouter>,
    )
    // Section heading (i18n key surfaced verbatim by the mock).
    expect(screen.getByText('landing.howTitle')).toBeInTheDocument()
    // Three numbered steps — the static "01"/"03" labels and the Bole "伯"
    // glyph are literal markup (not translated), so they assert the relocated
    // DOM is byte-identical.
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('03')).toBeInTheDocument()
    expect(screen.getByText('伯')).toBeInTheDocument()
    // The CTA Link still targets /start/talent (link target preserved).
    expect(screen.getByText('landing.howStartProfile').closest('a')).toHaveAttribute('href', '/start/talent')
  })

  it('SocialProofStrip falls back to the *Fallback labels when platform stats are null', () => {
    render(
      <MemoryRouter>
        <SocialProofStrip />
      </MemoryRouter>,
    )
    // GATING: companyLabel/talentLabel === null → the fallback stat + label keys
    // render (this is the conditional preserved verbatim in the relocation).
    expect(screen.getByText('landing.proofCompaniesStatFallback')).toBeInTheDocument()
    expect(screen.getByText('landing.proofCompaniesLabelFallback')).toBeInTheDocument()
    expect(screen.getByText('landing.proofTalentStatFallback')).toBeInTheDocument()
    expect(screen.getByText('landing.proofTalentLabelFallback')).toBeInTheDocument()
    // Static (always-on) signals also render.
    expect(screen.getByText('landing.proofPdpaStat')).toBeInTheDocument()
    expect(screen.getByText('landing.proofTimelineStat')).toBeInTheDocument()
  })

  it('SocialProofStrip uses live labels when platform stats resolve', () => {
    platformStats.mockReturnValueOnce({
      stats: { talents: 1200, companies: 30 } as unknown,
      talentLabel: '1.2k+',
      companyLabel: '30+',
    })
    render(
      <MemoryRouter>
        <SocialProofStrip />
      </MemoryRouter>,
    )
    // When labels are present, the live stat strings render and the non-fallback
    // label keys are used.
    expect(screen.getByText('30+')).toBeInTheDocument()
    expect(screen.getByText('1.2k+')).toBeInTheDocument()
    expect(screen.getByText('landing.proofCompaniesLabel')).toBeInTheDocument()
    expect(screen.getByText('landing.proofTalentLabel')).toBeInTheDocument()
  })
})
