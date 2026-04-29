import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchProfile } from '../lib/api'
import type { Profile } from '../types/db'

interface SessionState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  setProfile: (p: Profile | null) => void
}

export const useSession = create<SessionState>((set) => ({
  session: null,
  profile: null,
  loading: true,
  setProfile: (p) => set({ profile: p }),
  refresh: async () => {
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        set({ session: null, profile: null, loading: false })
        return
      }
      const profile = await fetchProfile(data.session.user.id).catch((e) => {
        console.error('[session] fetchProfile failed', e)
        return null
      })
      set({ session: data.session, profile, loading: false })
    } catch (e) {
      console.error('[session] refresh failed', e)
      set({ session: null, profile: null, loading: false })
    }
  },
  signOut: async () => {
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.error('[session] signOut failed', e)
    }
    set({ session: null, profile: null, loading: false })
    // Hard reload — clears all JS state and prevents any token-refresh race
    // from restoring the session before React Router can redirect.
    window.location.href = '/'
  },
}))

let bootstrapped = false
export function bootstrapSession() {
  if (bootstrapped) return
  bootstrapped = true

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

  supabase.auth.onAuthStateChange(async (_event, session) => {
    clearTimeout(watchdog)
    try {
      if (!session) {
        useSession.setState({ session: null, profile: null, loading: false })
        return
      }
      // Set the session immediately so route guards see auth state, even
      // before profile resolves. ConsentGate shows a spinner while profile
      // is null + session truthy.
      useSession.setState({ session, loading: false })
      const profile = await fetchProfile(session.user.id).catch((e) => {
        console.error('[session] fetchProfile failed in onAuthStateChange', e)
        return null
      })
      // Don't sign out on profile fetch failure — it cancels in-flight auth flows
      // (e.g. PKCE callback) and leaves the user stuck on "Check your email".
      // Onboarding/consent gates handle missing profiles gracefully.
      useSession.setState({ profile })
    } catch (e) {
      console.error('[session] onAuthStateChange failed', e)
      useSession.setState({ loading: false })
    }
  })
}
