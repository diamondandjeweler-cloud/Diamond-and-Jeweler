import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Profile, Role } from '../../../types/db'

// ===========================================================================
// CHARACTERIZATION TEST — route-guard composition (Phase 4 clean-arch, C3)
//
// Locks the observable behavior of the RoleGate -> ConsentGate -> OnboardingGate
// stack (each additionally sitting under ProtectedRoute at the Layout level) so
// that composing them into a single <Guarded> wrapper is proven behavior-
// preserving. Written to PASS against the hand-stacked gates FIRST; the same
// assertions then run against <Guarded> to prove byte-identical outcomes.
//
// The gates are the REAL components (ProtectedRoute/RoleGate/ConsentGate/
// OnboardingGate). Only their two external dependencies are mocked:
//   - useSession   (zustand store: callable hook + .getState())
//   - lib/legalVersion (consent-version compare) — seeded so ConsentGate does
//     not sit on a spinner or fire a network fetch.
// ===========================================================================

// --- Mutable session state driven per-test -------------------------------
interface MockState {
  session: unknown
  profile: Profile | null
  isHM: boolean
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  setProfile: (p: Profile | null) => void
  refreshIsHM: () => Promise<void>
}

const state: MockState = {
  session: null,
  profile: null,
  isHM: false,
  loading: false,
  refresh: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  setProfile: vi.fn(),
  refreshIsHM: vi.fn(async () => {}),
}

// zustand store is used both as a hook `useSession()` and as
// `useSession.getState()` / `.getState().refreshIsHM()` (RoleGate.tsx:37,56).
// The mock must be a callable that also carries a `.getState()`.
vi.mock('../../../state/useSession', () => {
  const useSession = Object.assign(() => state, { getState: () => state })
  return { useSession, bootstrapSession: vi.fn() }
})

// legalVersion: seed a concrete current legal version so ConsentGate resolves
// synchronously (no spinner, no network). consentSatisfiesVersion keeps its
// REAL semantics via the actual implementation to characterize the redirect.
let currentLegal: string | null = 'v1.0'
vi.mock('../../../lib/legalVersion', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/legalVersion')>('../../../lib/legalVersion')
  return {
    ...actual,
    getCachedLegalVersionSync: () => currentLegal,
    getCurrentLegalVersion: async () => currentLegal,
  }
})

// Imported AFTER the mocks are registered.
import ProtectedRoute from './ProtectedRoute'
import RoleGate from './RoleGate'
import ConsentGate from './ConsentGate'
import OnboardingGate from './OnboardingGate'
import Guarded from './Guarded'

const SENTINEL = 'GUARDED-CONTENT'
function Leaf() {
  return <div data-testid="leaf">{SENTINEL}</div>
}

function makeProfile(over: Partial<Profile>): Profile {
  return {
    id: 'u1',
    email: 'a@b.co',
    full_name: 'A B',
    display_name: null,
    phone: null,
    role: 'talent',
    consents: {},
    is_banned: false,
    ghost_score: 0,
    onboarding_complete: true,
    waitlist_approved: true,
    created_at: '',
    updated_at: '',
    consent_version: 'v1.0',
    consent_signed_at: null,
    locale: 'en',
    whatsapp_number: null,
    whatsapp_opt_in: false,
    points: 0,
    points_earned_total: 0,
    referral_code: null,
    ...over,
  }
}

/**
 * Render a protected route tree at `/target`. The tree mirrors App.tsx's
 * authenticated block: an outer ProtectedRoute wraps the layout Outlet, and
 * `wrapper(<Leaf/>)` is the per-route guard stack under test.
 *
 * We surface the redirect DESTINATION as visible text via sentinel routes so a
 * test can assert exactly which redirect fired (or that the leaf rendered).
 */
function renderAt(wrapper: (leaf: ReactNode) => ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/target']}>
      <Routes>
        {/* Outer wrapper = ProtectedRoute (as in App.tsx:203). */}
        <Route path="/target" element={<ProtectedRoute>{wrapper(<Leaf />)}</ProtectedRoute>} />
        {/* Redirect sinks — echo the destination path so assertions can read it. */}
        <Route path="/login" element={<div data-testid="dest">DEST:/login</div>} />
        <Route path="/home" element={<div data-testid="dest">DEST:/home</div>} />
        <Route path="/consent" element={<div data-testid="dest">DEST:/consent</div>} />
        <Route path="/onboarding/talent" element={<div data-testid="dest">DEST:/onboarding/talent</div>} />
        <Route path="/onboarding/hm" element={<div data-testid="dest">DEST:/onboarding/hm</div>} />
        <Route path="/onboarding/company" element={<div data-testid="dest">DEST:/onboarding/company</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// The hand-stacked guard exactly as written in App.tsx today (the thing being
// replaced). Kept here so the char test pins CURRENT behavior independent of
// <Guarded>.
function handStacked(
  allow: Role[],
  alsoAllowHRwithHM: boolean,
  leaf: ReactNode,
) {
  return (
    <RoleGate allow={allow} alsoAllowHRwithHM={alsoAllowHRwithHM}>
      <ConsentGate>
        <OnboardingGate>{leaf}</OnboardingGate>
      </ConsentGate>
    </RoleGate>
  )
}

function guardedWrapper(
  allow: Role[],
  alsoAllowHRwithHM: boolean,
  leaf: ReactNode,
) {
  return (
    <Guarded roles={allow} alsoAllowHRwithHM={alsoAllowHRwithHM}>
      {leaf}
    </Guarded>
  )
}

function expectLeaf() {
  expect(screen.getByTestId('leaf')).toHaveTextContent(SENTINEL)
}
function expectDest(path: string) {
  expect(screen.getByTestId('dest')).toHaveTextContent(`DEST:${path}`)
}

beforeEach(() => {
  state.session = null
  state.profile = null
  state.isHM = false
  state.loading = false
  currentLegal = 'v1.0'
  localStorage.clear()
})
afterEach(() => {
  vi.clearAllMocks()
})

// Each behavioral scenario is asserted twice: once against the hand-stacked
// gates (current App.tsx), once against <Guarded>. Byte-identical outcomes
// prove the refactor is behavior-preserving.
const wrappers: Array<[string, typeof handStacked]> = [
  ['hand-stacked', handStacked],
  ['<Guarded>', guardedWrapper],
]

describe.each(wrappers)('route-guard composition — %s', (_label, wrap) => {
  // --- ProtectedRoute layer: signed-out --------------------------------
  it('signed-out → redirect to /login', () => {
    state.session = null
    state.profile = null
    renderAt((leaf) => wrap(['talent'], false, leaf))
    expectDest('/login')
  })

  // --- RoleGate: wrong role --------------------------------------------
  it('right session, WRONG role → redirect to /home (RoleGate bounce)', () => {
    state.session = { user: { id: 'u1' } }
    state.profile = makeProfile({ role: 'hiring_manager' })
    renderAt((leaf) => wrap(['talent'], false, leaf))
    expectDest('/home')
  })

  // --- ConsentGate: consent stale --------------------------------------
  it('right role, STALE consent → redirect to /consent', () => {
    currentLegal = 'v2.0'
    state.session = { user: { id: 'u1' } }
    state.profile = makeProfile({ role: 'talent', consent_version: 'v1.0' })
    renderAt((leaf) => wrap(['talent'], false, leaf))
    expectDest('/consent')
  })

  // --- OnboardingGate: onboarding incomplete ---------------------------
  it('right role + consent ok, NOT onboarded → redirect to role onboarding', () => {
    state.session = { user: { id: 'u1' } }
    state.profile = makeProfile({ role: 'talent', onboarding_complete: false })
    renderAt((leaf) => wrap(['talent'], false, leaf))
    expectDest('/onboarding/talent')
  })

  it('HM not onboarded → redirect to /onboarding/hm', () => {
    state.session = { user: { id: 'u1' } }
    state.profile = makeProfile({ role: 'hiring_manager', onboarding_complete: false })
    renderAt((leaf) => wrap(['hiring_manager'], true, leaf))
    expectDest('/onboarding/hm')
  })

  it('HR not onboarded → redirect to /onboarding/company', () => {
    state.session = { user: { id: 'u1' } }
    state.profile = makeProfile({ role: 'hr_admin', onboarding_complete: false })
    renderAt((leaf) => wrap(['hr_admin'], false, leaf))
    expectDest('/onboarding/company')
  })

  // --- Fully authorized: leaf renders ----------------------------------
  it('talent fully authorized → leaf renders', () => {
    state.session = { user: { id: 'u1' } }
    state.profile = makeProfile({ role: 'talent' })
    renderAt((leaf) => wrap(['talent'], false, leaf))
    expectLeaf()
  })

  it('HM fully authorized → leaf renders', () => {
    state.session = { user: { id: 'u1' } }
    state.profile = makeProfile({ role: 'hiring_manager' })
    renderAt((leaf) => wrap(['hiring_manager'], true, leaf))
    expectLeaf()
  })

  it('HR fully authorized → leaf renders', () => {
    state.session = { user: { id: 'u1' } }
    state.profile = makeProfile({ role: 'hr_admin' })
    renderAt((leaf) => wrap(['hr_admin'], false, leaf))
    expectLeaf()
  })

  // --- alsoAllowHRwithHM: hr_admin who is their own HM -----------------
  it('hr_admin with isHM → allowed onto /hm route via alsoAllowHRwithHM', () => {
    state.session = { user: { id: 'u1' } }
    state.isHM = true
    state.profile = makeProfile({ role: 'hr_admin' })
    renderAt((leaf) => wrap(['hiring_manager'], true, leaf))
    expectLeaf()
  })

  // --- loading state ---------------------------------------------------
  it('loading (no session yet) → spinner, no leaf, no redirect', () => {
    state.loading = true
    state.session = null
    state.profile = null
    renderAt((leaf) => wrap(['talent'], false, leaf))
    expect(screen.queryByTestId('leaf')).toBeNull()
    expect(screen.queryByTestId('dest')).toBeNull()
  })
})
