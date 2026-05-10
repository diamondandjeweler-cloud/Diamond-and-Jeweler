import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'
import { getCurrentLegalVersion, consentSatisfiesVersion } from '../lib/legalVersion'

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

  // Fetch current legal_version once (cached in sessionStorage for 5min).
  // Treat 'unknown' as the not-yet-fetched state — we render a spinner during
  // the first fetch so we never flash protected content past the gate while
  // the version comparison is still in flight.
  const [currentLegal, setCurrentLegal] = useState<string | null | 'pending'>('pending')
  useEffect(() => {
    let cancelled = false
    void getCurrentLegalVersion().then((v) => {
      if (!cancelled) setCurrentLegal(v)
    })
    return () => { cancelled = true }
  }, [])

  if (loading) return <LoadingSpinner full />
  if (!profile) {
    if (session) return <LoadingSpinner full />  // profile still loading
    return <Navigate to="/login" replace />
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
