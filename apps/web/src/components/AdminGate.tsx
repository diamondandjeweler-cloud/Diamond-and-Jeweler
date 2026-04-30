import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'
import { isAdminVerificationFresh } from '../lib/adminReauth'

/**
 * Restricts a route to users with `profile.role === 'admin'`.
 * Non-admins are redirected to /home. In addition to ProtectedRoute (which
 * checks for a session) and server-side RLS, this gate also requires that the
 * admin actively re-entered credentials within REAUTH_WINDOW_MS — a persisted
 * Supabase session alone is not enough.
 */
export default function AdminGate({ children }: { children: ReactNode }) {
  const { loading, profile } = useSession()
  const location = useLocation()

  if (loading) return <LoadingSpinner full />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role !== 'admin') return <Navigate to="/home" replace />
  if (!isAdminVerificationFresh()) {
    return (
      <Navigate
        to="/login?reauth=1"
        state={{ from: location.pathname }}
        replace
      />
    )
  }

  return <>{children}</>
}
