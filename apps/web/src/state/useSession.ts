import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchProfile } from '../lib/api'
import { clearAdminVerified } from '../lib/adminReauth'
import { clearAllDashCaches } from '../lib/dashboardCache'
import type { Profile } from '../types/db'

// ===========================================================================
// Session STORE (Phase 5 clean-arch) — this file now holds ONLY the session/
// profile/isHM/loading STATE + the store methods (refresh/signOut/setProfile/
// refreshIsHM) and the small set of helpers those methods invoke.
//
// The infrastructure ORCHESTRATION (PKCE scrub, auth-state listener, watchdog,
// visibility re-warm, retry ladder, HMR dispose) lives in
// `src/app/bootstrap/sessionBootstrap.ts`. `bootstrapSession` is re-exported
// from here so the ~47 existing `import { useSession, bootstrapSession } from
// '../state/useSession'` sites keep working byte-identically.
//
// The helpers exported below (enforceBan, clearProfileRetries,
// pushProfileRetryTimer, cache load/save, cookie set/clear, fetchIsHM) are
// SHARED between the store methods and the bootstrap module. They live here —
// with the store — precisely to avoid a store<->bootstrap import cycle: the
// bootstrap module imports the store (and these helpers); the store never
// imports the bootstrap module except for the leaf-safe `bootstrapSession`
// re-export at the bottom.
// ===========================================================================

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
export function setAuthHintCookie(accessToken?: string | null) {
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    // Backwards-compat presence cookie — not sensitive, fine as readable JS cookie.
    document.cookie = `dnj-auth=1; Path=/; Max-Age=2592000; SameSite=Lax${secure}`
    if (accessToken) {
      // sb-jwt carries the actual Supabase access token; set it HttpOnly via a
      // server-side API route so JS cannot read it (prevents XSS token theft).
      // Fire-and-forget — the cookie lands before the next navigation that
      // triggers middleware, so timing is safe.
      void fetch('/api/set-auth-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: accessToken }),
      }).catch(() => { /* tolerate */ })
    }
  } catch { /* tolerate */ }
}

export function clearAuthHintCookie() {
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `dnj-auth=; Path=/; Max-Age=0; SameSite=Lax${secure}`
    // Clear the HttpOnly sb-jwt via the server-side route — JS cannot directly
    // expire an HttpOnly cookie.
    void fetch('/api/set-auth-cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: null }),
    }).catch(() => { /* tolerate */ })
  } catch { /* tolerate */ }
}

export async function fetchIsHM(userId: string): Promise<boolean> {
  // IMPORTANT: this uses an explicit authenticated REST fetch rather than the
  // supabase-js query builder. Empirically (verified live), the builder's
  // `.from('hiring_managers').eq('profile_id', me)` returns 0 rows here even
  // for a user who has the row — while an identical raw fetch carrying the same
  // access token + apikey returns it. The builder appears not to attach the
  // user token to this particular request, yielding an anon-scoped false
  // negative that wrongly bounces "Switch to HM view". Reading the token from
  // getSession() and attaching it ourselves is deterministic. (This is a raw
  // PostgREST fetch, NOT supabase.from/.rpc, so the seam guard does not flag it;
  // it is shared with the bootstrap listener, so it lives here to avoid a
  // store<->bootstrap cycle.)
  try {
    // getSession() transparently refreshes an expired/near-expiry token. With
    // the in-tab serializing lock (lib/supabase.ts) this no longer races the
    // auto-refresh tick, so the token it returns is valid — no explicit
    // refreshSession() needed (that would just add another racer).
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    if (!token) return false
    const base = import.meta.env.VITE_SUPABASE_URL as string
    const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    const url = `${base}/rest/v1/hiring_managers?select=id&profile_id=eq.${encodeURIComponent(userId)}&limit=1`
    const r = await fetch(url, { headers: { apikey, Authorization: `Bearer ${token}` } })
    if (!r.ok) {
      console.error('[session] fetchIsHM failed', r.status)
      return false
    }
    const rows = (await r.json()) as unknown[]
    return Array.isArray(rows) && rows.length > 0
  } catch (e) {
    console.error('[session] fetchIsHM threw', e)
    return false
  }
}

export const useSession = create<SessionState>((set) => ({
  session: null,
  profile: null,
  isHM: false,
  loading: true,
  setProfile: (p) => set({ profile: p }),
  refreshIsHM: async () => {
    // Runs in a NORMAL context (not inside onAuthStateChange), so getSession()
    // reliably warms the token and the subsequent fetchIsHM query carries auth
    // to PostgREST. This is the authoritative isHM resolver — the bootstrap's
    // in-callback fetch is best-effort and can false-negative.
    const { data } = await supabase.auth.getSession()
    if (!data.session) { set({ isHM: false }); return }
    const isHM = await fetchIsHM(data.session.user.id)
    set({ isHM })
    saveCachedIsHM(data.session.user.id, isHM)
  },
  refresh: async () => {
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        set({ session: null, profile: null, isHM: false, loading: false })
        return
      }
      const cached = loadCachedProfile()
      const validCache = cached && cached.id === data.session.user.id
      const [profile, isHM] = await Promise.all([
        fetchProfile(data.session.user.id).catch((e) => {
          console.error('[session] fetchProfile failed', e)
          // Same cache-preservation guard as the bootstrap path — never let a
          // transient fetch error overwrite a valid cached profile with null.
          return validCache ? cached : null
        }),
        fetchIsHM(data.session.user.id),
      ])
      const finalProfile = profile ?? (validCache ? cached : null)
      if (finalProfile?.is_banned) { enforceBan(); return }
      set({ session: data.session, profile: finalProfile, isHM, loading: false })
      if (finalProfile) saveCachedProfile(finalProfile)
    } catch (e) {
      // F-cache regression — don't blow away the session/profile on a
      // network-level failure of getSession(). The user might still have
      // a valid local session that just couldn't be re-verified this round.
      console.error('[session] refresh failed', e)
      set({ loading: false })
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
    clearProfileRetries()
    clearAdminVerified()
    saveCachedProfile(null)
    saveCachedIsHM(null, false)
    clearAllDashCaches()
    try { sessionStorage.removeItem('dnj.admin_aal_state') } catch { /* tolerate */ }
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

// Profile cache uses sessionStorage (clears on tab close) — localStorage would
// persist PII across browser sessions, which is a PDPA compliance risk.
// The isHM flag contains no PII so it stays in localStorage for cross-session
// persistence (avoids false-negative "Switch to HM view" bounces on reload).
const PROFILE_CACHE_KEY = 'dnj.profile_cache'
const ISHM_CACHE_KEY = 'dnj.ishm_cache'

export function loadCachedProfile(): Profile | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch { return null }
}

export function saveCachedProfile(profile: Profile | null) {
  try {
    if (profile) sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
    else sessionStorage.removeItem(PROFILE_CACHE_KEY)
  } catch { /* tolerate */ }
}

interface IsHMCacheEntry { userId: string; isHM: boolean }

export function loadCachedIsHM(userId: string): boolean | null {
  try {
    const raw = localStorage.getItem(ISHM_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as IsHMCacheEntry
    // Only honour the cache if it's for the same user — a re-seeded test account
    // or a shared browser would otherwise inherit the wrong HM flag.
    return parsed && parsed.userId === userId ? !!parsed.isHM : null
  } catch { return null }
}

export function saveCachedIsHM(userId: string | null, isHM: boolean) {
  try {
    // Only persist a POSITIVE result. A false is frequently a transient
    // auth-context false-negative on the hiring_managers select; caching it
    // would make "Switch to HM view" permanently bounce across reloads.
    // Non-HMs (the majority — all talents) simply re-fetch each load, which
    // is one cheap indexed lookup and never blocks render.
    if (userId && isHM) localStorage.setItem(ISHM_CACHE_KEY, JSON.stringify({ userId, isHM } satisfies IsHMCacheEntry))
    else localStorage.removeItem(ISHM_CACHE_KEY)
  } catch { /* tolerate */ }
}

// A banned user keeps a technically-valid JWT, and RLS still returns their own
// profile row, so without this client gate they'd route straight into a working
// dashboard. (Sensitive server actions are already blocked server-side:
// _shared/auth authenticate() rejects is_banned, and RLS scopes every read to
// the caller's own rows.) On detecting is_banned we clear the local session and
// hard-redirect to the /banned notice. Called from both profile-resolve points
// (refresh() here + the bootstrap auth-state listener).
export function enforceBan(): void {
  try { void supabase.auth.signOut() } catch { /* tolerate */ }
  saveCachedProfile(null)
  saveCachedIsHM(null, false)
  clearAuthHintCookie()
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('sb-') || k === 'supabase.auth.token') localStorage.removeItem(k)
    })
  } catch { /* tolerate */ }
  useSession.setState({ session: null, profile: null, isHM: false, loading: false })
  if (typeof window !== 'undefined' && window.location.pathname !== '/banned') {
    window.location.replace('/banned')
  }
}

// U4 — track the profile-retry ladder's timers so they can be cancelled on
// logout / user-switch. Without this, the setTimeout calls scheduled by the
// bootstrap listener keep firing refresh() after the session is gone (orphaned
// timers). clearProfileRetries is called from BOTH signOut() (store) and the
// bootstrap listener; pushProfileRetryTimer lets the bootstrap listener register
// its scheduled timers against this shared array.
let profileRetryTimers: ReturnType<typeof setTimeout>[] = []
export function clearProfileRetries() {
  profileRetryTimers.forEach(clearTimeout)
  profileRetryTimers = []
}
export function pushProfileRetryTimer(timer: ReturnType<typeof setTimeout>) {
  profileRetryTimers.push(timer)
}

// Re-export bootstrapSession from the extracted bootstrap module so the existing
// `import { useSession, bootstrapSession } from '../state/useSession'` sites
// (main.tsx, App.tsx, ~47 consumers) keep working unchanged. This is a
// leaf-safe re-export: bootstrapSession is a function invoked at runtime, so the
// store<->bootstrap module cycle resolves fine under ESM.
export { bootstrapSession } from '../app/bootstrap/sessionBootstrap'
