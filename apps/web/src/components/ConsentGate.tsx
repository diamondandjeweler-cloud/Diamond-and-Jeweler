import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
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
  const { loading, profile, session } = useSession()

  // Escape hatch: if a session is present but profile never arrives (e.g. because
  // fetchProfile hangs behind a stalled Supabase token refresh), stop spinning
  // after 15 s and redirect to login — infinite spinner is never acceptable UX.
  const [profileStuck, setProfileStuck] = useState(false)
  useEffect(() => {
    if (!loading && session && !profile) {
      const t = setTimeout(() => setProfileStuck(true), 15_000)
      return () => clearTimeout(t)
    }
    setProfileStuck(false)
    return undefined
  }, [loading, session, profile])

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
    if (session && !profileStuck) return <LoadingSpinner full />  // profile still loading
    return <Navigate to="/login" replace />  // no session, or profile never arrived
  }

  // restaurant_staff bypass — they're internal users, not subject to the
  // PDPA recruitment-consent flow.
  if (profile.role === 'restaurant_staff') return <>{children}</>

  if (currentLegal === 'pending') return <LoadingSpinner full />

  // F20 — block on stale consent. The helper fails-open (returns true) when
  // currentLegal is null, so a system_config blip won't lock everyone out.
  if (!consentSatisfiesVersion(profile.consent_version, currentLegal)) {
    return <Navigate to="/consent" replace />
  }

  return <>{children}</>
}
