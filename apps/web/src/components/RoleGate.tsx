import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'
import type { Role } from '../types/db'

interface Props {
  allow: Role[]
  /** When true, also let `hr_admin` users through if they self-registered as
   *  a hiring manager (have a hiring_managers row). Used on /hm routes for
   *  the small-company case where one person plays both roles. */
  alsoAllowHRwithHM?: boolean
  children: ReactNode
}

export default function RoleGate({ allow, alsoAllowHRwithHM, children }: Props) {
  const { loading, profile, session, isHM } = useSession()
  if (loading) return <LoadingSpinner full />
  if (!profile) {
    // Session exists but profile is still loading (e.g. after token refresh).
    // Show spinner rather than bouncing to /login → /home → role-home.
    if (session) return <LoadingSpinner full />
    return <Navigate to="/login" replace />
  }
  const allowed =
    allow.includes(profile.role)
    || (alsoAllowHRwithHM && profile.role === 'hr_admin' && isHM)
  if (!allowed) return <Navigate to="/home" replace />
  return <>{children}</>
}
