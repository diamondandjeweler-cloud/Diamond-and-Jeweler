import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { loading, session } = useSession()

  if (loading) return <LoadingSpinner full />
  if (!session) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname }}
        replace
      />
    )
  }
  return <>{children}</>
}
