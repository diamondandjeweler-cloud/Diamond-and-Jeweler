import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * secrecy-a11y-inj-1: the PDPA consent body must render in the user's active UI
 * language. Before the fix it was hard-coded talentBody('en')/hiringBody('en'),
 * so a BM/中文 user was shown (and asked to "agree" to) English-only consent even
 * though full ms/zh bodies exist in the file.
 */

const h = vi.hoisted(() => ({ lang: 'en' }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: h.lang } }),
}))
vi.mock('zustand/react/shallow', () => ({ useShallow: (fn: unknown) => fn }))
vi.mock('../../state/useSession', () => ({
  useSession: (selector: (s: unknown) => unknown) =>
    selector({ session: { user: { id: 'u1' } }, profile: { role: 'talent', consent_version: null }, refresh: () => {} }),
}))
vi.mock('../../data/repositories/consents', () => ({
  activeConsentVersions: () => Promise.resolve({ data: [{ id: 'c1', version: 'v1.1', language: 'en', body_md: 'seed' }] }),
  recordConsent: vi.fn(),
}))
vi.mock('../../lib/useSeo', () => ({ useSeo: () => {} }))
vi.mock('../../lib/legalVersion', () => ({
  clearLegalVersionCache: vi.fn(),
  consentSatisfiesVersion: () => false,
  getCurrentLegalVersion: () => Promise.resolve('v1.1'),
  normaliseLegalVersion: (v: string) => v,
}))
vi.mock('react-router-dom', () => ({
  Navigate: () => null,
  Link: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useNavigate: () => vi.fn(),
}))

import Consent from './Consent'

beforeEach(() => { cleanup(); h.lang = 'en' })

describe('<Consent /> — locale-appropriate PDPA body (secrecy-a11y-inj-1)', () => {
  it('renders the Bahasa Malaysia body when the UI language is ms', async () => {
    h.lang = 'ms'
    render(<Consent />)
    expect(await screen.findByText(/Persetujuan Pemprosesan Data \(Pihak Calon\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Data Processing Consent \(Candidate side\)/)).toBeNull()
  })

  it('renders the Chinese body when the UI language is zh', async () => {
    h.lang = 'zh'
    render(<Consent />)
    expect(await screen.findByText(/数据处理同意书（候选方）/)).toBeInTheDocument()
  })

  it('falls back to English for a region-suffixed / unsupported language', async () => {
    h.lang = 'en-MY'
    render(<Consent />)
    expect(await screen.findByText(/Data Processing Consent \(Candidate side\)/)).toBeInTheDocument()
  })
})
