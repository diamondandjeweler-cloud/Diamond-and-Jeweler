import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../state/useSession'
import { clearAdminVerified, isAdminVerificationFresh, markAdminVerified } from '../lib/adminReauth'
import LoadingSpinner from './LoadingSpinner'
import { supabase } from '../lib/supabase'

type AalState = 'loading' | 'aal2' | 'need_challenge' | 'need_enroll'

// Test-domain bypass: when VITE_BYPASS_ADMIN_MFA=true AND running a dev build,
// admin accounts under @dnj-test.my skip the TOTP gate so automated smoke
// tests can drive the admin console without a human relaying codes.
// The import.meta.env.DEV guard ensures this can never activate in a prod
// bundle even if the env var is accidentally set to "true" in production.
const BYPASS_ADMIN_MFA = import.meta.env.DEV && import.meta.env.VITE_BYPASS_ADMIN_MFA === 'true'
function isTestAdmin(email: string | undefined | null): boolean {
  return BYPASS_ADMIN_MFA && !!email && email.toLowerCase().endsWith('@dnj-test.my')
}

// Per-tab cache: once MFA has resolved to aal2 in this tab, skip the round-trip
// on subsequent /admin navigations. Cleared on signOut (useSession) and on tab
// close (sessionStorage). Keeps the spinner off the screen for repeat visits.
const AAL_CACHE_KEY = 'dnj.admin_aal_state'
function readCachedAal(): AalState | null {
  try {
    const v = sessionStorage.getItem(AAL_CACHE_KEY)
    return v === 'aal2' ? 'aal2' : null
  } catch { return null }
}
function writeCachedAal(v: AalState) {
  try {
    if (v === 'aal2') sessionStorage.setItem(AAL_CACHE_KEY, v)
    else sessionStorage.removeItem(AAL_CACHE_KEY)
  } catch { /* tolerate */ }
}

export default function AdminGate({ children }: { children: ReactNode }) {
  const { loading, profile } = useSession()
  const location = useLocation()
  const [aal, setAal] = useState<AalState>(() => readCachedAal() ?? 'loading')

  useEffect(() => {
    if (loading || !profile || profile.role !== 'admin') return
    if (isTestAdmin(profile.email)) { setAal('aal2'); writeCachedAal('aal2'); return }
    // Reauth window: force fresh MFA challenge if the admin has been idle >30 min,
    // even if the AAL cache says 'aal2'. Closes the dead-code gap in the reauth window.
    if (!isAdminVerificationFresh()) {
      clearAdminVerified()
      sessionStorage.removeItem('dnj.admin_aal_state')
      setAal('need_challenge')
      return
    }
    // Already verified earlier in this tab — don't re-check.
    if (readCachedAal() === 'aal2') { setAal('aal2'); return }
    let cancelled = false
    // Hard 5 s timeout — never spin forever on a hung MFA endpoint.
    const timeout = setTimeout(() => {
      if (!cancelled) { cancelled = true; setAal('need_challenge') }
    }, 5000)
    async function checkAal() {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (cancelled) return
      clearTimeout(timeout)
      if (!data) { setAal('need_challenge'); return }

      if (data.currentLevel === 'aal2') {
        markAdminVerified()
        setAal('aal2')
        writeCachedAal('aal2')
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
      if (isOAuth) { markAdminVerified(); setAal('aal2'); writeCachedAal('aal2'); return }

      // AAL1 via password — check if a verified TOTP factor exists
      const { data: factors } = await supabase.auth.mfa.listFactors()
      if (cancelled) return
      const hasVerifiedTotp = factors?.totp?.some(f => f.status === 'verified')
      setAal(hasVerifiedTotp ? 'need_challenge' : 'need_enroll')
    }
    void checkAal()
    return () => { cancelled = true; clearTimeout(timeout) }
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
