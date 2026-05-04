import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'
import type { Role } from '../types/db'

export default function RoleGate({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { loading, profile } = useSession()
  if (loading) return <LoadingSpinner full />
  if (!profile) return <Navigate to="/login" replace />
  if (!allow.includes(profile.role)) return <Navigate to="/home" replace />
  return <>{children}</>
}
