import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'

/**
 * Redirects authenticated users who haven't completed onboarding to the right
 * onboarding route based on role. Wrap dashboard routes in this gate.
 */
export default function OnboardingGate({ children }: { children: ReactNode }) {
  const { profile, loading } = useSession()

  if (loading) return <LoadingSpinner full />
  if (!profile) return <Navigate to="/login" replace />

  if (!profile.onboarding_complete) {
    if (profile.role === 'talent')         return <Navigate to="/onboarding/talent" replace />
    if (profile.role === 'hiring_manager') return <Navigate to="/onboarding/hm" replace />
    if (profile.role === 'hr_admin')       return <Navigate to="/onboarding/company" replace />
  }

  return <>{children}</>
}
