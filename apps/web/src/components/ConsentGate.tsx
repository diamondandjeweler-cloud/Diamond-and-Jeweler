import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import LoadingSpinner from './LoadingSpinner'
import { getCachedLegalVersionSync, getCurrentLegalVersion, consentSatisfiesVersion } from '../lib/legalVersion'

/**
 * Forces consent before any authenticated route. Runs *before* OnboardingGate
 * so first-time users sign the PDPA waiver before submitting personal data.
 *
 * Three states:
 *   1. No consent_version → first-time user, redirect to /consent
 *   2. consent_version != current legal_version → re-consent required (F20),
 *      redirect to /consent with re-consent UX
 *   3. consent_version == current legal_version → pass through
 *
 * Orphan-session guard: if a session is present but the profile is still
 * loading (null), show a spinner rather than redirecting to /login — a
 * redirect would bounce back to /home and create a render loop.
 */
export default function ConsentGate({ children }: { children: ReactNode }) {
  const { loading, profile, session, refresh, signOut } = useSession(useShallow((s) => ({ loading: s.loading, profile: s.profile, session: s.session, refresh: s.refresh, signOut: s.signOut })))

  // Profile-load retry ladder: session present but profile null on mobile
  // (slow 4G, transient TLS hiccup, JWT not yet propagated to PostgREST) used
  // to bounce the user to /login after 15s, which then re-triggered Google
  // OAuth — and since the session was still valid, they'd come right back
  // to this gate, hit null profile again, and loop. Now we retry refresh()
  // silently twice before showing a recoverable error screen with a manual
  // retry/sign-out — never a Navigate-to-login that creates the loop.
  const [retries, setRetries] = useState(0)
  const [profileStuck, setProfileStuck] = useState(false)
  useEffect(() => {
    if (!loading && session && !profile) {
      if (retries < 2) {
        // Auto-retry after 6s — short enough to feel responsive on mobile,
        // long enough to let a hung token refresh complete.
        const t = setTimeout(() => {
          setRetries((n) => n + 1)
          void refresh()
        }, 6_000)
        return () => clearTimeout(t)
      }
      // Exhausted retries — surface the error screen.
      const t = setTimeout(() => setProfileStuck(true), 6_000)
      return () => clearTimeout(t)
    }
    setProfileStuck(false)
    setRetries(0)
    return undefined
  }, [loading, session, profile, retries, refresh])

  // Initialise synchronously from localStorage so the spinner never appears when
  // the cache is warm (covers most cold Chrome-open scenarios after first load).
  // The effect below only fires a network fetch when the cache is missing/expired.
  const [currentLegal, setCurrentLegal] = useState<string | null | 'pending'>(getCachedLegalVersionSync)
  useEffect(() => {
    // Re-read cache inside the effect to avoid stale-closure issues.
    // If still fresh, no fetch needed (state was already set correctly above).
    const sync = getCachedLegalVersionSync()
    if (sync !== 'pending') { setCurrentLegal(sync); return }

    let cancelled = false
    // Fail open after 4s — a hung Supabase connection must not trap users on a spinner.
    const timeout = setTimeout(() => {
      if (!cancelled) { cancelled = true; setCurrentLegal(null) }
    }, 4000)
    void getCurrentLegalVersion().then((v) => {
      clearTimeout(timeout)
      if (!cancelled) setCurrentLegal(v)
    })
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [])

  if (loading) return <LoadingSpinner full />
  if (!profile) {
    // No session at all — legitimate redirect to login.
    if (!session) return <Navigate to="/login" replace />
    if (!profileStuck) return <LoadingSpinner full />
    // Session present but profile fetch failed even after retries. Navigating
    // to /login here would loop (session is still valid, user signs in again,
    // lands back here). Show a recoverable error screen instead.
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ink-50">
        <div className="max-w-md w-full bg-white border rounded-lg p-6 shadow-sm text-center space-y-4">
          <h1 className="text-xl font-semibold">We couldn't load your profile</h1>
          <p className="text-sm text-ink-600">
            Your sign-in worked, but we're having trouble fetching your account details.
            This usually clears on retry — especially on slower mobile networks.
          </p>
          <button
            onClick={() => { setProfileStuck(false); setRetries(0); void refresh() }}
            className="w-full py-2 rounded bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
          >
            Try again
          </button>
          <button
            onClick={() => { void signOut() }}
            className="w-full py-2 rounded border border-ink-200 text-sm text-ink-700 hover:bg-ink-50"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  // System admins do not go through the user-facing PDPA consent flow.
  if (profile.role === 'admin') return <>{children}</>

  if (currentLegal === 'pending') return <LoadingSpinner full />

  // F20 — block on stale consent. The helper fails-open (returns true) when
  // currentLegal is null, so a system_config blip won't lock everyone out.
  if (!consentSatisfiesVersion(profile.consent_version, currentLegal)) {
    return <Navigate to="/consent" replace />
  }

  return <>{children}</>
}
