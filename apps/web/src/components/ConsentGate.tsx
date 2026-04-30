import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'

/**
 * Forces consent before any authenticated route. Runs *before* OnboardingGate
 * so first-time users sign the PDPA waiver before submitting personal data.
 *
 * Orphan-session guard: if a session is present but the profile is still
 * loading (null), show a spinner rather than redirecting to /login — a
 * redirect would bounce back to /home and create a render loop.
 */
export default function ConsentGate({ children }: { children: ReactNode }) {
  const { loading, profile, session } = useSession()
  if (loading) return <LoadingSpinner full />
  if (!profile) {
    if (session) return <LoadingSpinner full />  // profile still loading
    return <Navigate to="/login" replace />
  }
  if (profile.role !== 'restaurant_staff' && !profile.consent_version) return <Navigate to="/consent" replace />
  return <>{children}</>
}
