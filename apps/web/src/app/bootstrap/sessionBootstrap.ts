// ===========================================================================
// Session bootstrap — infrastructure side-effects (Phase 5 clean-arch)
//
// This module owns the imperative, side-effectful ORCHESTRATION that wires the
// Supabase auth lifecycle into the Zustand session store. Extracted out of
// `src/state/useSession.ts` so that store now holds ONLY session/profile/isHM/
// loading STATE + the handful of methods (refresh/signOut/setProfile/
// refreshIsHM) and consumes this bootstrap module.
//
// What lives HERE (bootstrap-only, never touched by a store method):
//   - PKCE verifier scrub at boot
//   - visibilitychange/focus re-warm wiring
//   - the 8s splash watchdog
//   - the onAuthStateChange subscription (dedupe + SWR + per-fetch timeout +
//     3-tier profile retry ladder + cookie sync)
//   - fetchIsHM (raw authenticated PostgREST fetch — deliberately NOT the
//     supabase-js builder; see the note on the function)
//   - HMR dispose cleanup
//
// What stays in the STORE file (shared with refresh()/signOut() — kept there to
// avoid a store<->bootstrap import cycle, and re-imported here):
//   enforceBan, clearProfileRetries, cache load/save, clearAuthHintCookie,
//   setAuthHintCookie, saveCachedIsHM, fetchIsHM (also called by refresh()/
//   refreshIsHM()).
//
// The §6 in-tab auth-refresh lock in lib/supabase.ts is UNTOUCHED — this module
// only calls supabase.auth.* / raw fetch, routing AROUND that lock.
// ===========================================================================
import { supabase } from '../../lib/supabase'
import { fetchProfile } from '../../lib/api'
import {
  useSession,
  enforceBan,
  clearProfileRetries,
  pushProfileRetryTimer,
  clearAuthHintCookie,
  setAuthHintCookie,
  loadCachedProfile,
  saveCachedProfile,
  loadCachedIsHM,
  saveCachedIsHM,
  fetchIsHM,
} from '../../state/useSession'

// ---------------------------------------------------------------------------
// Re-warm the auth session whenever the tab regains focus. Background tabs
// throttle timers, so supabase-js's auto-refresh can miss a token rotation while
// hidden — and the noopLock in lib/supabase.ts removes the cross-tab
// coordination that would otherwise catch up. A token then expires unnoticed;
// the next query 401s ("JWT expired") and the app appears frozen until a manual
// reload. getSession() refreshes a stale token on demand, so calling it on
// visibility/focus restores a valid token before the user's next action.
// ---------------------------------------------------------------------------
let visibilityRewarmWired = false
function wireVisibilityRewarm() {
  if (visibilityRewarmWired || typeof document === 'undefined') return
  visibilityRewarmWired = true
  const rewarm = () => {
    if (document.visibilityState !== 'visible') return
    // getSession() returns the stored session and transparently refreshes it
    // if the access token is expired/near-expiry. Fire-and-forget.
    void supabase.auth.getSession().catch(() => { /* tolerate */ })
  }
  document.addEventListener('visibilitychange', rewarm)
  window.addEventListener('focus', rewarm)
}

let bootstrapped = false

export function bootstrapSession() {
  if (bootstrapped) return
  bootstrapped = true
  wireVisibilityRewarm()

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

  // Dedupe key — supabase-js fires onAuthStateChange repeatedly (INITIAL_SESSION,
  // TOKEN_REFRESHED, USER_UPDATED, sometimes back-to-back). Without this, every
  // event triggers another fetchProfile + fetchIsHM round-trip, which is what
  // showed up as duplicate /profiles and /hiring_managers calls in DevTools.
  let lastFetchedFor: string | null = null
  const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
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
        // supabase-js's AuthChangeEvent union narrows away SIGNED_OUT/USER_DELETED
        // in some versions, so we widen via Set<string> to keep the runtime check
        // intact regardless of type-defs.
        const definitiveEvents = new Set<string>(['SIGNED_OUT', 'USER_DELETED', 'INITIAL_SESSION'])
        const definitive = definitiveEvents.has(event as unknown as string)
        if (definitive) {
          lastFetchedFor = null
          clearProfileRetries()
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
      // before profile resolves. Serve stale profile from cache so
      // ConsentGate/RoleHome pass through without a spinner while the
      // fresh fetch runs in the background (stale-while-revalidate).
      setAuthHintCookie(session.access_token)
      // Dedupe: if we already fetched profile/isHM for this user in this tab,
      // skip the round-trip. Token refreshes (USER_UPDATED, TOKEN_REFRESHED)
      // would otherwise re-issue the same queries every few minutes.
      const dedupeKey = session.user.id
      if (lastFetchedFor === dedupeKey) {
        useSession.setState({ session, loading: false })
        return
      }
      lastFetchedFor = dedupeKey
      const cachedProfile = loadCachedProfile()
      // Only serve cached profile for the current session user. A stale cache
      // from a different user (e.g., previous occupant of a shared browser, or
      // a re-seeded test account with a new UUID) would cause wrong-role routing
      // before the authoritative DB fetch completes.
      const validCache = cachedProfile && cachedProfile.id === session.user.id
      const cachedIsHM = loadCachedIsHM(session.user.id)
      // Don't serve a cached profile that is already flagged banned — the fresh
      // fetch below will enforceBan() authoritatively, but skip the optimistic
      // dashboard paint in the meantime.
      if (validCache && cachedProfile.is_banned) { enforceBan(); return }
      useSession.setState({
        session,
        loading: false,
        ...(validCache ? { profile: cachedProfile } : {}),
        ...(cachedIsHM != null ? { isHM: cachedIsHM } : {}),
      })
      // Both fetches are guarded by a 12 s timeout. If the Supabase auth token
      // refresh hangs (e.g. Cloudflare latency), these promises would otherwise
      // block forever — keeping profile=null and trapping the user on a spinner.
      // On timeout we fall back to the stale cached profile so the gate can pass.
      const FETCH_TIMEOUT = 12_000
      const withTimeout = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
        Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), FETCH_TIMEOUT))])
      const [profile, isHM] = await Promise.all([
        withTimeout(
          fetchProfile(session.user.id).catch((e) => {
            console.error('[session] fetchProfile failed in onAuthStateChange', e)
            return validCache ? cachedProfile : null
          }),
          validCache ? cachedProfile : null,
        ),
        withTimeout(fetchIsHM(session.user.id).catch(() => false), false),
      ])
      // Don't sign out on profile fetch failure — it cancels in-flight auth flows
      // (e.g. PKCE callback) and leaves the user stuck on "Check your email".
      // Onboarding/consent gates handle missing profiles gracefully.
      //
      // Cache-preservation guard: if the fresh fetch returned null (transient
      // Supabase error, RLS hiccup, network timeout) but we had a valid cached
      // profile for this same user, keep the cached value. Overwriting it with
      // null wipes localStorage and causes the next reload to start cold —
      // which was the "spinner hang on /hr" regression that broke prod after
      // the dashboard-refactor deploy.
      const finalProfile = profile ?? (validCache ? cachedProfile : null)
      if (finalProfile?.is_banned) { enforceBan(); return }
      useSession.setState({ profile: finalProfile, isHM })
      // Only persist a NON-null profile. Persisting null on a transient error
      // would defeat the cache-preservation guard above on the next reload.
      if (finalProfile) saveCachedProfile(finalProfile)
      saveCachedIsHM(session.user.id, isHM)
      // If the profile didn't resolve at all (no cache, fetch failed) — clear
      // the dedup key so a subsequent TOKEN_REFRESHED or refresh() call gets
      // another shot at fetching it. Otherwise the user is trapped on the
      // spinner until they manually reload.
      if (!finalProfile) {
        lastFetchedFor = null
        // Proactive retry ladder — TOKEN_REFRESHED only fires ~hourly, so
        // without this the user stays on the spinner indefinitely. Retry
        // refresh() at 3s, 8s, 18s (jittered). After the third attempt the
        // surrounding gate UI (ConsentGate retry escape hatch / route-level
        // error boundary) takes over and offers manual sign-out.
        const session2 = session
        const retryDelays = [3_000, 5_000, 10_000]
        // U4 — cancel any prior batch before scheduling a fresh one, and track
        // each timer id so logout / user-switch can clear them (see
        // clearProfileRetries). Prevents orphaned retries firing post-logout.
        clearProfileRetries()
        retryDelays.forEach((delay, i) => {
          const timer = setTimeout(() => {
            // Bail if user signed out, navigated to a different session, or
            // profile arrived in the meantime.
            const cur = useSession.getState()
            if (!cur.session || cur.session.user.id !== session2.user.id) return
            if (cur.profile) return
            console.warn(`[session] profile retry #${i + 1} firing (cache empty, last fetch failed)`)
            useSession.getState().refresh().catch((err) => {
              console.error(`[session] profile retry #${i + 1} failed`, err)
            })
          }, delay)
          pushProfileRetryTimer(timer)
        })
      }
    } catch (e) {
      console.error('[session] onAuthStateChange failed', e)
      useSession.setState({ loading: false })
    }
  })

  // HMR cleanup: unsubscribe the auth listener when the module is hot-replaced
  // so the next bootstrap call starts with a clean slate instead of accumulating
  // duplicate listeners. Production builds ignore import.meta.hot.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      bootstrapped = false
      visibilityRewarmWired = false
      authSubscription.unsubscribe()
    })
  }
}
