/**
 * "Basics" wizard step — structured name + job title form (never sent to AI).
 *
 * Relocated verbatim from HMOnboarding.tsx. Purely presentational: it receives
 * its values + setters and the two callbacks (advance-to-chat, switch-to-talent)
 * as props. The submit guard (`fullName.trim() && jobTitle.trim()`) is unchanged
 * — the parent passes the phase advance as `onSubmit`. No logic changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button } from '../../../components/ui'

interface BasicsStepProps {
  t: TFunction
  fullName: string
  setFullName: (v: string) => void
  jobTitle: string
  setJobTitle: (v: string) => void
  switching: boolean
  switchErr: string | null
  onSubmit: () => void
  onSwitchToTalent: () => void
}

function BasicsStepImpl({
  t,
  fullName, setFullName,
  jobTitle, setJobTitle,
  switching, switchErr,
  onSubmit, onSwitchToTalent,
}: BasicsStepProps) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (fullName.trim() && jobTitle.trim()) onSubmit() }}
      className="space-y-3"
    >
      <p className="text-sm text-ink-600">
        {t('hmOnboard.basicsIntro')}
      </p>
      <div>
        <label htmlFor="hm-onboard-full-name" className="block text-sm font-medium text-ink-700 mb-1">{t('common.fullName')}</label>
        <input
          id="hm-onboard-full-name"
          type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
          placeholder={t('hmOnboard.fullNamePlaceholder')}
          // First field of the onboarding step; autoFocus mirrors a fresh wizard arrival.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label htmlFor="hm-onboard-job-title" className="block text-sm font-medium text-ink-700 mb-1">{t('hmOnboard.jobTitleLabel')}</label>
        <input
          id="hm-onboard-job-title"
          type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
          placeholder={t('hmOnboard.jobTitlePlaceholder')}
          className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <Button type="submit" disabled={!fullName.trim() || !jobTitle.trim()} className="w-full" size="lg">
        {t('hmOnboard.continueToChat')}
      </Button>
      <div className="text-center pt-1">
        <button
          type="button"
          onClick={onSwitchToTalent}
          disabled={switching}
          className="text-xs text-ink-400 hover:text-ink-600 underline"
        >
          {switching ? t('hmOnboard.switching') : t('hmOnboard.switchToTalent')}
        </button>
        {switchErr && <p className="text-xs text-red-600 mt-1">{switchErr}</p>}
      </div>
    </form>
  )
}

const BasicsStep = memo(BasicsStepImpl)
export default BasicsStep
