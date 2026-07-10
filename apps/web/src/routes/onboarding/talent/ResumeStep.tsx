/**
 * "Resume / welcome back" wizard step — shown when saved progress is restored.
 *
 * Relocated verbatim from TalentOnboarding.tsx. Purely presentational: it
 * receives fullName + the derived chatDone/dobFilled flags and the
 * continue/start-over callbacks as props. The parent still computes chatDone,
 * dobFilled and nextPhase, owns all state, and passes onContinue / onStartOver.
 * No logic changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button } from '../../../components/ui'
import { ProgressStep } from './StepBits'

interface ResumeStepProps {
  t: TFunction
  fullName: string
  chatDone: boolean
  dobFilled: boolean
  onContinue: () => void
  onStartOver: () => void
}

function ResumeStepImpl({ t, fullName, chatDone, dobFilled, onContinue, onStartOver }: ResumeStepProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-700 dark:text-fg-strong font-medium">{t('talentOnboard.resumeProgressIntro')}</p>
      <div className="space-y-1.5">
        <ProgressStep label={t('talentOnboard.stepNameContact')} done={!!fullName} doneLabel={t('talentOnboard.stepDone')} nextLabel={t('talentOnboard.stepNext')} />
        <ProgressStep label={t('talentOnboard.stepChat')} done={chatDone} active={!chatDone} doneLabel={t('talentOnboard.stepDone')} nextLabel={t('talentOnboard.stepNext')} />
        <ProgressStep label={t('talentOnboard.stepBackgroundDob')} done={dobFilled} active={chatDone && !dobFilled} doneLabel={t('talentOnboard.stepDone')} nextLabel={t('talentOnboard.stepNext')} />
        <ProgressStep label={t('talentOnboard.stepDocuments')} done={false} active={dobFilled} doneLabel={t('talentOnboard.stepDone')} nextLabel={t('talentOnboard.stepNext')} />
      </div>
      <Button onClick={onContinue} className="w-full mt-2" size="lg">
        {t('talentOnboard.continueWhereLeftOff')}
      </Button>
      <button
        type="button"
        className="w-full text-xs text-ink-400 dark:text-fg-muted hover:text-ink-600 dark:hover:text-fg-strong py-1"
        onClick={onStartOver}
      >
        {t('talentOnboard.startOver')}
      </button>
    </div>
  )
}

const ResumeStep = memo(ResumeStepImpl)
export default ResumeStep
