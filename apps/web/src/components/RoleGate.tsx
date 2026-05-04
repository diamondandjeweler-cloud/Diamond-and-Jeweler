import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'
import type { Role } from '../types/db'

export default function RoleGate({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { loading, profile, session } = useSession()
  if (loading) return <LoadingSpinner full />
  if (!profile) {
    // Session exists but profile is still loading (e.g. after token refresh).
    // Show spinner rather than bouncing to /login → /home → role-home.
    if (session) return <LoadingSpinner full />
    return <Navigate to="/login" replace />
  }
  if (!allow.includes(profile.role)) return <Navigate to="/home" replace />
  return <>{children}</>
}
