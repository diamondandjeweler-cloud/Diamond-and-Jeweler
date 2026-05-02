import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'
import { supabase } from '../lib/supabase'

type AalState = 'loading' | 'aal2' | 'need_challenge' | 'need_enroll'

export default function AdminGate({ children }: { children: ReactNode }) {
  const { loading, profile } = useSession()
  const location = useLocation()
  const [aal, setAal] = useState<AalState>('loading')

  useEffect(() => {
    if (loading || !profile || profile.role !== 'admin') return
    let cancelled = false
    async function checkAal() {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (cancelled) return
      if (!data) { setAal('need_challenge'); return }

      if (data.currentLevel === 'aal2') {
        setAal('aal2')
        return
      }

      // AAL1 — check if a verified TOTP factor exists
      const { data: factors } = await supabase.auth.mfa.listFactors()
      if (cancelled) return
      const hasVerifiedTotp = factors?.totp?.some(f => f.status === 'verified')
      setAal(hasVerifiedTotp ? 'need_challenge' : 'need_enroll')
    }
    void checkAal()
    return () => { cancelled = true }
  }, [loading, profile])

  if (loading) return <LoadingSpinner full />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role !== 'admin') return <Navigate to="/home" replace />
  if (aal === 'loading') return <LoadingSpinner full />

  if (aal === 'need_enroll') {
    return <Navigate to="/mfa/enroll" state={{ from: location.pathname }} replace />
  }
  if (aal === 'need_challenge') {
    return <Navigate to="/mfa/challenge" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
