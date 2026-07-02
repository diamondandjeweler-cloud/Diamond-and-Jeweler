import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '../types/db'

// ===========================================================================
// CHARACTERIZATION TEST — session store + bootstrap listener (Phase 5)
//
// Pins the OBSERVABLE session-state transitions that survive the extraction of
// infrastructure side-effects out of useSession.ts into
// app/bootstrap/sessionBootstrap.ts. Written against the REAL zustand store +
// REAL bootstrapSession; only the external dependencies are mocked:
//   - lib/supabase  (auth.getSession / signOut / onAuthStateChange captured)
//   - lib/api       (fetchProfile)
//   - lib/adminReauth / lib/dashboardCache (side-effect no-ops)
//
// These lock the store's PUBLIC contract (session/profile/isHM/loading + the
// four methods) so the split is proven behavior-preserving for everything a
// unit test can drive. Timing-only + network-only paths (cookie sync POST,
// watchdog, PKCE scrub, visibility re-warm) are noted in coverageGaps and left
// to live e2e.
// ===========================================================================

// --- Mockable auth surface ------------------------------------------------
type AuthCb = (event: string, session: unknown) => void | Promise<void>
let authCb: AuthCb | null = null
const getSessionMock = vi.fn<() => Promise<{ data: { session: unknown } }>>()
const signOutMock = vi.fn(async () => ({ error: null }))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSessionMock(),
      signOut: () => signOutMock(),
      onAuthStateChange: (cb: AuthCb) => {
        authCb = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
  },
}))

const fetchProfileMock = vi.fn<(id: string) => Promise<Profile | null>>()
vi.mock('../lib/api', () => ({ fetchProfile: (id: string) => fetchProfileMock(id) }))
vi.mock('../lib/adminReauth', () => ({ clearAdminVerified: vi.fn() }))
vi.mock('../lib/dashboardCache', () => ({ clearAllDashCaches: vi.fn() }))

// Imported AFTER the mocks are registered.
import { useSession, bootstrapSession } from './useSession'

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

// A minimal Session — only access_token + user.id are read by the code under
// test; the remaining Session fields are never touched, so a cast is safe.
const SESSION = { access_token: 'tok', user: { id: 'u1' } } as unknown as Session

// Stub navigation + fetch so jsdom doesn't throw on href assignment / the
// fire-and-forget cookie POST.
let hrefValue = 'http://localhost/'
const replaceMock = vi.fn()
beforeEach(() => {
  vi.useRealTimers()
  // NOTE: authCb is deliberately NOT nulled here. bootstrapSession() is a module
  // singleton guarded by `bootstrapped` — it wires onAuthStateChange exactly
  // once, so authCb captured on the first bootstrap must persist across tests.
  getSessionMock.mockReset()
  signOutMock.mockClear()
  fetchProfileMock.mockReset()
  replaceMock.mockClear()
  hrefValue = 'http://localhost/'
  // Reset the store to a known baseline before each scenario.
  useSession.setState({ session: null, profile: null, isHM: false, loading: true })
  sessionStorage.clear()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })))
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      protocol: 'http:',
      pathname: '/',
      get href() { return hrefValue },
      set href(v: string) { hrefValue = v },
      replace: replaceMock,
    },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// STORE METHODS — refresh() / signOut() / refreshIsHM()
// ---------------------------------------------------------------------------
describe('useSession store methods', () => {
  it('refresh() with NO session → clears to signed-out, loading:false', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } })
    await useSession.getState().refresh()
    const s = useSession.getState()
    expect(s.session).toBeNull()
    expect(s.profile).toBeNull()
    expect(s.isHM).toBe(false)
    expect(s.loading).toBe(false)
  })

  it('refresh() with valid session + profile → populates session/profile, loading:false', async () => {
    getSessionMock.mockResolvedValue({ data: { session: SESSION } })
    fetchProfileMock.mockResolvedValue(makeProfile({ id: 'u1', role: 'talent' }))
    await useSession.getState().refresh()
    const s = useSession.getState()
    expect(s.session).toEqual(SESSION)
    expect(s.profile?.id).toBe('u1')
    expect(s.loading).toBe(false)
  })

  it('refresh() with banned profile → enforceBan clears state + hard-redirects to /banned', async () => {
    getSessionMock.mockResolvedValue({ data: { session: SESSION } })
    fetchProfileMock.mockResolvedValue(makeProfile({ id: 'u1', is_banned: true }))
    await useSession.getState().refresh()
    const s = useSession.getState()
    expect(s.session).toBeNull()
    expect(s.profile).toBeNull()
    expect(replaceMock).toHaveBeenCalledWith('/banned')
  })

  it('refresh() where fetchProfile fails but a valid cache exists → cache preserved, not nulled', async () => {
    // Seed a valid cached profile for the SAME user via a prior successful refresh.
    getSessionMock.mockResolvedValue({ data: { session: SESSION } })
    fetchProfileMock.mockResolvedValueOnce(makeProfile({ id: 'u1', full_name: 'Cached User' }))
    await useSession.getState().refresh()
    expect(useSession.getState().profile?.full_name).toBe('Cached User')
    // Now the fetch fails — the cached profile must survive.
    fetchProfileMock.mockRejectedValueOnce(new Error('network'))
    await useSession.getState().refresh()
    const s = useSession.getState()
    expect(s.profile?.full_name).toBe('Cached User')
    expect(s.session).toEqual(SESSION)
  })

  it('signOut() → clears state, loading:false, hard reload to /', async () => {
    useSession.setState({ session: SESSION, profile: makeProfile({ id: 'u1' }), isHM: true, loading: false })
    await useSession.getState().signOut()
    const s = useSession.getState()
    expect(s.session).toBeNull()
    expect(s.profile).toBeNull()
    expect(s.isHM).toBe(false)
    expect(s.loading).toBe(false)
    expect(hrefValue).toBe('/')
  })

  it('refreshIsHM() with no session → isHM:false', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } })
    useSession.setState({ isHM: true })
    await useSession.getState().refreshIsHM()
    expect(useSession.getState().isHM).toBe(false)
  })

  it('refreshIsHM() with session + HM row present → isHM:true', async () => {
    getSessionMock.mockResolvedValue({ data: { session: SESSION } })
    // fetchIsHM issues a raw fetch to /rest/v1/hiring_managers — return one row.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ id: 'hm1' }] })))
    await useSession.getState().refreshIsHM()
    expect(useSession.getState().isHM).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BOOTSTRAP LISTENER — onAuthStateChange transitions (the extracted module)
// ---------------------------------------------------------------------------
describe('bootstrapSession auth-state listener', () => {
  beforeEach(async () => {
    // getSession() is used inside fetchIsHM during the listener; keep it valid.
    getSessionMock.mockResolvedValue({ data: { session: SESSION } })
    // bootstrapSession is idempotent (module guard). The listener callback is
    // captured on the first call; subsequent calls are no-ops but authCb stays
    // set from whichever call first wired it.
    bootstrapSession()
    expect(authCb).not.toBeNull()
    // The listener holds closure state (lastFetchedFor dedupe key) that survives
    // across tests since the module singleton is wired once. Fire a definitive
    // sign-out to reset lastFetchedFor=null so each scenario starts un-deduped.
    await authCb!('SIGNED_OUT', null)
    useSession.setState({ session: null, profile: null, isHM: false, loading: true })
    fetchProfileMock.mockReset()
  })

  it('SIGNED_OUT (definitive null) → clears session/profile, loading:false', async () => {
    useSession.setState({ session: SESSION, profile: makeProfile({ id: 'u1' }), isHM: true, loading: false })
    await authCb!('SIGNED_OUT', null)
    const s = useSession.getState()
    expect(s.session).toBeNull()
    expect(s.profile).toBeNull()
    expect(s.isHM).toBe(false)
    expect(s.loading).toBe(false)
  })

  it('transient null (non-definitive event) → preserves session/profile, only flips loading', async () => {
    const prof = makeProfile({ id: 'u1' })
    useSession.setState({ session: SESSION, profile: prof, isHM: true, loading: true })
    await authCb!('TOKEN_REFRESHED', null)
    const s = useSession.getState()
    // Session + profile must NOT be wiped on a transient null.
    expect(s.session).toEqual(SESSION)
    expect(s.profile).toBe(prof)
    expect(s.loading).toBe(false)
  })

  it('signed-in event → sets session immediately then resolves profile', async () => {
    fetchProfileMock.mockResolvedValue(makeProfile({ id: 'u1', role: 'talent' }))
    await authCb!('INITIAL_SESSION', SESSION)
    const s = useSession.getState()
    expect(s.session).toEqual(SESSION)
    expect(s.profile?.id).toBe('u1')
    expect(s.loading).toBe(false)
  })

  it('signed-in with profile:null (fetch returns null, no cache) → session set, loading:false, no ban/redirect loop', async () => {
    fetchProfileMock.mockResolvedValue(null)
    await authCb!('INITIAL_SESSION', SESSION)
    const s = useSession.getState()
    // Session must be present (route guards see auth) even though profile is null —
    // onboarding/consent gates handle the missing profile without bouncing.
    expect(s.session).toEqual(SESSION)
    expect(s.profile).toBeNull()
    expect(s.loading).toBe(false)
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('TOKEN_REFRESHED for the SAME user dedupes → does not re-fetch profile', async () => {
    fetchProfileMock.mockResolvedValue(makeProfile({ id: 'u1' }))
    await authCb!('INITIAL_SESSION', SESSION)
    const callsAfterFirst = fetchProfileMock.mock.calls.length
    expect(callsAfterFirst).toBe(1)
    // Same-user refresh event: dedupe key hits, no second fetchProfile round-trip.
    await authCb!('TOKEN_REFRESHED', SESSION)
    expect(fetchProfileMock.mock.calls.length).toBe(callsAfterFirst)
    expect(useSession.getState().session).toEqual(SESSION)
    expect(useSession.getState().loading).toBe(false)
  })

  it('signed-in banned profile → enforceBan redirect, state cleared', async () => {
    fetchProfileMock.mockResolvedValue(makeProfile({ id: 'u1', is_banned: true }))
    await authCb!('INITIAL_SESSION', SESSION)
    const s = useSession.getState()
    expect(s.session).toBeNull()
    expect(s.profile).toBeNull()
    expect(replaceMock).toHaveBeenCalledWith('/banned')
  })
})
