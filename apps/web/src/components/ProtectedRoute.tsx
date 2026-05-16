import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { loading, session } = useSession()

  if (loading) return <LoadingSpinner full />
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <>{children}</>
}
