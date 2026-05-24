import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
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

  // `isHM` is resolved asynchronously and starts `false`. For the
  // hr_admin-who-is-also-their-own-HM case, bouncing on that initial `false`
  // would wrongly deny a real HM (the "Switch to HM view" bounce). When this
  // gate could ONLY be satisfied via isHM (route role-set excludes hr_admin
  // but alsoAllowHRwithHM is set), run an authoritative isHM check and WAIT for
  // it before deciding — rather than redirecting on the unresolved value.
  const role = profile?.role
  const needsHMCheck =
    !!alsoAllowHRwithHM && role === 'hr_admin' && !allow.includes('hr_admin' as Role)
  const [hmCheckDone, setHmCheckDone] = useState(false)

  useEffect(() => {
    if (!needsHMCheck) return
    if (isHM) { setHmCheckDone(true); return }
    let cancelled = false
    // refreshIsHM runs in a normal context with serialized token refresh
    // (see lib/supabase.ts in-tab lock) so it resolves the true value reliably.
    void useSession.getState().refreshIsHM().finally(() => {
      if (!cancelled) setHmCheckDone(true)
    })
    // Safety valve — never wait forever.
    const t = setTimeout(() => { if (!cancelled) setHmCheckDone(true) }, 8000)
    return () => { cancelled = true; clearTimeout(t) }
  }, [needsHMCheck, isHM])

  if (loading) return <LoadingSpinner full />
  if (!profile) {
    // Session exists but profile is still loading (e.g. after token refresh).
    // Show spinner rather than bouncing to /login → /home → role-home.
    if (session) return <LoadingSpinner full />
    return <Navigate to="/login" replace />
  }

  const allowedByRole = allow.includes(profile.role)
  const allowedByHM = !!alsoAllowHRwithHM && profile.role === 'hr_admin' && isHM
  if (allowedByRole || allowedByHM) return <>{children}</>

  // Still potentially allowed via isHM, but the confirmation check hasn't
  // finished — wait instead of bouncing on the unresolved value.
  if (needsHMCheck && !hmCheckDone) return <LoadingSpinner full />

  return <Navigate to="/home" replace />
}
