import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import LoadingSpinner from './LoadingSpinner'
import { supabase } from '../lib/supabase'

type AalState = 'loading' | 'aal2' | 'need_challenge' | 'need_enroll'

// Test-domain bypass: when VITE_BYPASS_ADMIN_MFA=true (dev / CI only), admin
// accounts under @dnj-test.my skip the TOTP gate so automated smoke tests can
// drive the admin console without a human relaying codes.
// Production builds leave this unset → false → MFA always enforced.
// To verify MFA enforcement in staging, set VITE_BYPASS_ADMIN_MFA=false.
const BYPASS_ADMIN_MFA = import.meta.env.VITE_BYPASS_ADMIN_MFA === 'true'
function isTestAdmin(email: string | undefined | null): boolean {
  return BYPASS_ADMIN_MFA && !!email && email.toLowerCase().endsWith('@dnj-test.my')
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

      // Google (or any OAuth) login is strong auth — skip TOTP requirement.
      // currentAuthenticationMethods is typed as AMREntry[] | string[] (union of arrays),
      // which creates an overloaded .some() that TS can't resolve with a typed callback.
      // Cast to any[] to avoid the overload ambiguity.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isOAuth = ((data.currentAuthenticationMethods ?? []) as any[]).some(
        (m: any) => (typeof m === 'string' ? m : m?.method) === 'oauth',
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
