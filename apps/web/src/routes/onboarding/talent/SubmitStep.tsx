/**
 * "Submit" terminal wizard step — saving spinner, or error + retry.
 *
 * Relocated verbatim from TalentOnboarding.tsx. Purely presentational: the
 * finalise() orchestration and all state stay in the parent. onRetry wraps
 * () => void finalise(); onBackToReview wraps () => { setErr(null);
 * setPhase('review') }. The err/busy conditional is pure prop-driven
 * rendering. No logic changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button, Alert } from '../../../components/ui'

interface SubmitStepProps {
  t: TFunction
  err: string | null
  busy: boolean
  onRetry: () => void
  onBackToReview: () => void
}

function SubmitStepImpl({ t, err, busy, onRetry, onBackToReview }: SubmitStepProps) {
  return (
    <div className="space-y-4 text-center py-2">
      {err ? (
        <>
          <Alert tone="red">{err}</Alert>
          <Button onClick={onRetry} loading={busy} className="w-full">
            {t('talentOnboard.retry')}
          </Button>
          <button
            type="button"
            onClick={onBackToReview}
            className="w-full text-xs text-ink-400 dark:text-fg-muted hover:text-ink-600 dark:hover:text-fg-strong py-1"
          >{t('talentOnboard.backToReview')}</button>
        </>
      ) : (
        <>
          <div className="flex justify-center">
            <svg className="animate-spin h-8 w-8 text-brand-500" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-base font-medium text-fg">{t('talentOnboard.savingProfile')}</p>
          <p className="text-sm text-fg-muted leading-relaxed max-w-xs mx-auto">
            {t('talentOnboard.savingProfileHint')}
          </p>
        </>
      )}
    </div>
  )
}

const SubmitStep = memo(SubmitStepImpl)
export default SubmitStep
