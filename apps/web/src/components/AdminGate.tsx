import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'
import { supabase } from '../lib/supabase'

type AalState = 'loading' | 'aal2' | 'need_challenge' | 'need_enroll'

// Test-domain bypass: admin accounts under @dnj-test.my skip the MFA gate so
// automated smoke tests can drive the admin console without a human relaying
// TOTP codes. Production admins (real @diamondandjeweler.com or personal
// gmail addresses) are unaffected. Mirrors the planned BYPASS_CAPTCHA shape.
function isTestAdmin(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase().endsWith('@dnj-test.my')
}

export default function AdminGate({ children }: { children: ReactNode }) {
  const { loading, profile } = useSession()
  const location = useLocation()
  const [aal, setAal] = useState<AalState>('loading')

  useEffect(() => {
    if (loading || !profile || profile.role !== 'admin') return
    if (isTestAdmin(profile.email)) { setAal('aal2'); return }
    let cancelled = false
    async function checkAal() {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (cancelled) return
      if (!data) { setAal('need_challenge'); return }

      if (data.currentLevel === 'aal2') {
        setAal('aal2')
        return
      }

      // Google (or any OAuth) login is strong auth — skip TOTP requirement
      const isOAuth = data.currentAuthenticationMethods?.some(
        (m: { method: string }) => m.method === 'oauth'
      )
      if (isOAuth) { setAal('aal2'); return }

      // AAL1 via password — check if a verified TOTP factor exists
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
