import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchProfile } from '../lib/api'
import { clearAdminVerified } from '../lib/adminReauth'
import type { Profile } from '../types/db'

interface SessionState {
  session: Session | null
  profile: Profile | null
  /** True iff the user has a hiring_managers row. Used to surface HM nav for
   *  hr_admin users who self-registered as HM in their own small company. */
  isHM: boolean
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  setProfile: (p: Profile | null) => void
  refreshIsHM: () => Promise<void>
}

// F13 — JWT cookie read by apps/web/middleware.ts to validate /admin access
// at the network edge before the SPA shell is served. The cookie carries
// the actual Supabase access_token so the edge can verify the signature
// against SUPABASE_JWT_SECRET — that closes the gap where a forged
// `dnj-auth=1` cookie used to slip past the soft gate.
//
// Real authorization (admin role, RLS scopes) still lives in AdminGate +
// Supabase RLS — the edge gate only confirms the request comes from a
// holder of a non-expired Supabase JWT.
function setAuthHintCookie(accessToken?: string | null) {
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    // Backwards-compat presence cookie. Older middleware bundles that
    // haven't picked up the JWT change yet still work.
    document.cookie = `dnj-auth=1; Path=/; Max-Age=2592000; SameSite=Lax${secure}`
    if (accessToken) {
      // The Supabase access token is itself a signed JWT; the edge verifies
      // signature + exp claim with SUPABASE_JWT_SECRET.
      // Match the access token's expiry (~1h) — supabase-js refreshes it,
      // and the bootstrap below re-mirrors on every state change.
      document.cookie =
        `sb-jwt=${encodeURIComponent(accessToken)}; Path=/; Max-Age=3600; SameSite=Lax${secure}`
    }
  } catch { /* tolerate */ }
}

function clearAuthHintCookie() {
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `dnj-auth=; Path=/; Max-Age=0; SameSite=Lax${secure}`
    document.cookie = `sb-jwt=; Path=/; Max-Age=0; SameSite=Lax${secure}`
  } catch { /* tolerate */ }
}

async function fetchIsHM(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('hiring_managers')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[session] fetchIsHM failed', error)
    return false
  }
  return !!data
}

export const useSession = create<SessionState>((set) => ({
  session: null,
  profile: null,
  isHM: false,
  loading: true,
  setProfile: (p) => set({ profile: p }),
  refreshIsHM: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) { set({ isHM: false }); return }
    const isHM = await fetchIsHM(data.session.user.id)
    set({ isHM })
  },
  refresh: async () => {
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        set({ session: null, profile: null, isHM: false, loading: false })
        return
      }
      const [profile, isHM] = await Promise.all([
        fetchProfile(data.session.user.id).catch((e) => {
          console.error('[session] fetchProfile failed', e)
          return null
        }),
        fetchIsHM(data.session.user.id),
      ])
      set({ session: data.session, profile, isHM, loading: false })
    } catch (e) {
      console.error('[session] refresh failed', e)
      set({ session: null, profile: null, isHM: false, loading: false })
    }
  },
  signOut: async () => {
    // Race against a 3s timeout: a hung Supabase call must not trap the user
    // on the page. We then force-clear the persisted tokens ourselves so the
    // hard reload below can't restore the session.
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('signOut timeout')), 3000),
        ),
      ])
    } catch (e) {
      console.error('[session] signOut failed or timed out', e)
    }
    clearAdminVerified()
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sb-') || k === 'supabase.auth.token') localStorage.removeItem(k)
      })
    } catch { /* tolerate */ }
    clearAuthHintCookie()
    set({ session: null, profile: null, isHM: false, loading: false })
    // Hard reload — clears all JS state and prevents any token-refresh race
    // from restoring the session before React Router can redirect.
    window.location.href = '/'
  },
}))

let bootstrapped = false
export function bootstrapSession() {
  if (bootstrapped) return
  bootstrapped = true

  // Wipe stale PKCE verifiers from prior abandoned sign-ins. A verifier is only
  // valid between the redirect-to-Google and the callback exchange; if one is
  // present at boot on any non-callback route, it's leftover from an aborted
  // flow and will poison the next OAuth (Google issues a fresh code that won't
  // match the stale verifier, exchange fails silently, 6-10s watchdog fires).
  try {
    const onCallback = typeof window !== 'undefined'
      && window.location.pathname.startsWith('/auth/callback')
    if (!onCallback) {
      Object.keys(localStorage).forEach((k) => {
        if (k.includes('code-verifier') || k.endsWith('-pkce')) localStorage.removeItem(k)
      })
    }
  } catch { /* tolerate */ }

  // Single source of truth: rely on onAuthStateChange's INITIAL_SESSION event.
  // Calling refresh() in parallel races with the auth-token lock.

  // Watchdog: never let the splash spinner hang past 8s, even if Supabase
  // is unreachable or env vars are wrong. App can then render its real error UI.
  const watchdog = setTimeout(() => {
    if (useSession.getState().loading) {
      console.error('[session] bootstrap watchdog tripped — forcing loading=false')
      useSession.setState({ loading: false })
    }
  }, 8000)

  supabase.auth.onAuthStateChange(async (event, session) => {
    clearTimeout(watchdog)
    try {
      // F7 — only react to definitive sign-out events. supabase-js fires
      // onAuthStateChange with `session: null` for several reasons (USER_UPDATED
      // mid-call, transient TOKEN_REFRESHED before the new token lands, network
      // hiccups) — historically that wiped state and made any RLS-failing query
      // (e.g. the Approvals embed) feel like an auto-logout. Now we only blank
      // session state on SIGNED_OUT or USER_DELETED, plus the very first
      // INITIAL_SESSION when there's genuinely no persisted session.
      if (!session) {
        const definitive =
          event === 'SIGNED_OUT' ||
          event === 'USER_DELETED' ||
          event === 'INITIAL_SESSION'
        if (definitive) {
          clearAuthHintCookie()
          useSession.setState({ session: null, profile: null, isHM: false, loading: false })
        } else {
          // Transient null — flip loading off but preserve existing session/profile
          // so route guards don't bounce the user mid-action.
          console.warn('[session] ignoring transient null session for event', event)
          useSession.setState({ loading: false })
        }
        return
      }
      // Set the session immediately so route guards see auth state, even
      // before profile resolves. ConsentGate shows a spinner while profile
      // is null + session truthy.
      setAuthHintCookie(session.access_token)
      useSession.setState({ session, loading: false })
      const [profile, isHM] = await Promise.all([
        fetchProfile(session.user.id).catch((e) => {
          console.error('[session] fetchProfile failed in onAuthStateChange', e)
          return null
        }),
        fetchIsHM(session.user.id),
      ])
      // Don't sign out on profile fetch failure — it cancels in-flight auth flows
      // (e.g. PKCE callback) and leaves the user stuck on "Check your email".
      // Onboarding/consent gates handle missing profiles gracefully.
      useSession.setState({ profile, isHM })
    } catch (e) {
      console.error('[session] onAuthStateChange failed', e)
      useSession.setState({ loading: false })
    }
  })
}
