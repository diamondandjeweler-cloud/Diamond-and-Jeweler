import type { ReactNode } from 'react'
import RoleGate from './RoleGate'
import ConsentGate from './ConsentGate'
import OnboardingGate from './OnboardingGate'
import type { Role } from '../../../types/db'

/**
 * Presentational route-guard composer (Phase 4 clean-arch, C3).
 *
 * Collapses the verbatim `<RoleGate …><ConsentGate><OnboardingGate>{leaf}
 * </OnboardingGate></ConsentGate></RoleGate>` triple-wrapper that App.tsx
 * repeated across the 15 consent+onboarding-gated dashboard routes (2 talent,
 * 11 HM, 2 HR) into one wrapper.
 *
 * Behavior-preserving by construction: the gates are rendered in the EXACT
 * same fixed order (RoleGate → ConsentGate → OnboardingGate) with the same
 * props, so the rendered DOM and every redirect/spinner outcome are identical
 * to the hand-stacked form. See Guarded.test.tsx for the characterization
 * suite that asserts this equivalence across every guard combo.
 *
 * NOTE — scope is deliberately the three PER-ROUTE gates only. `ProtectedRoute`
 * is NOT folded in: in App.tsx it wraps the shared Layout Outlet once for every
 * authenticated route (App.tsx:203), so it already sits above every route this
 * composer is used on. Folding it here would double-wrap it and break the
 * shared-Layout structure. `AdminGate` routes (/admin) and the ConsentGate-only
 * routes (/consent, /onboarding/*, /referrals, /points) are intentionally left
 * hand-written — they do NOT use this stack.
 */
export default function Guarded({
  roles,
  alsoAllowHRwithHM,
  children,
}: {
  roles: Role[]
  alsoAllowHRwithHM?: boolean
  children: ReactNode
}) {
  return (
    <RoleGate allow={roles} alsoAllowHRwithHM={alsoAllowHRwithHM}>
      <ConsentGate>
        <OnboardingGate>{children}</OnboardingGate>
      </ConsentGate>
    </RoleGate>
  )
}
