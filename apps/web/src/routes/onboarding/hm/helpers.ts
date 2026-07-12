/**
 * Pure helpers + shared types for the HM onboarding wizard.
 *
 * These were relocated verbatim from HMOnboarding.tsx as part of a
 * behavior-preserving decomposition. No logic changed.
 */
import type { TFunction } from 'i18next'

export type Phase =
  | 'basics' | 'chat' | 'mustHaves' | 'demographics' | 'hiringDetails'
  | 'dob' | 'review' | 'submit' | 'done'

export interface ApiMessage { role: 'user' | 'assistant'; content: string }

/**
 * Normalize a restored wizard phase after a page reload. DOB, gender, dobConsent
 * and dobSkipped are intentionally NEVER persisted (no plaintext DOB in
 * localStorage), so a saved 'review' phase would restore with an empty DOB/gender
 * and still let the user submit — silently dropping them. Route 'review' back to
 * 'dob' so the unpersisted DOB/gender/consent must be re-supplied first; every
 * other phase restores unchanged. Mirrors Talent onboarding's resume→dob routing.
 */
export function hmRestorePhase(phase: Phase): Phase {
  return phase === 'review' ? 'dob' : phase
}

/**
 * Per-phase wizard headline. Relocated verbatim from HMOnboarding — identical
 * key mapping and final-empty-string fallback.
 */
export function headlineForPhase(phase: Phase, t: TFunction): string {
  return (
    phase === 'basics'       ? t('hmOnboard.headlineBasics') :
    phase === 'chat'         ? t('hmOnboard.headlineChat') :
    phase === 'mustHaves'    ? t('hmOnboard.headlineMustHaves') :
    phase === 'demographics' ? t('hmOnboard.headlineDemographics') :
    phase === 'hiringDetails'? t('hmOnboard.headlineHiringDetails') :
    phase === 'dob'          ? t('hmOnboard.headlineDob') :
    phase === 'review'       ? t('hmOnboard.headlineReview') :
    phase === 'submit'       ? t('hmOnboard.headlineSubmit') : ''
  )
}

/**
 * Per-phase progress percentage for the ChatShell progress bar. Relocated
 * verbatim from HMOnboarding — identical thresholds and 100 fallback.
 */
export function progressPctForPhase(phase: Phase): number {
  return (
    phase === 'basics'       ? 5  :
    phase === 'chat'         ? 40 :
    phase === 'mustHaves'    ? 55 :
    phase === 'demographics' ? 68 :
    phase === 'hiringDetails'? 78 :
    phase === 'dob'          ? 88 :
    phase === 'review'       ? 94 :
    phase === 'submit'       ? 97 : 100
  )
}
