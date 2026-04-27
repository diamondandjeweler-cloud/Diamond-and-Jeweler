import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'

/**
 * Restricts a route to users with `profile.role === 'admin'`.
 * Non-admins are redirected to /home (where RoleHome will route them to
 * their correct dashboard). Unauthenticated users are already caught by
 * ProtectedRoute upstream; this is defense-in-depth on top of server-side RLS.
 */
export default function AdminGate({ children }: { children: ReactNode }) {
  const { loading, profile } = useSession()

  if (loading) return <LoadingSpinner full />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role !== 'admin') return <Navigate to="/home" replace />

  return <>{children}</>
}
