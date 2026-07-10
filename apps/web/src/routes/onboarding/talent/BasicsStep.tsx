/**
 * "Basics" wizard step — structured name + phone form.
 *
 * Relocated verbatim from TalentOnboarding.tsx. Purely presentational: it
 * receives fullName/phone + their setters, the switching/switchErr flags, and
 * the submit / switch-to-hiring callbacks as props. The submit handler
 * (preventDefault + draftKey persistence + setPhase('chat')) stays in the
 * parent and is passed verbatim as onSubmit. No logic changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button } from '../../../components/ui'

interface BasicsStepProps {
  t: TFunction
  fullName: string
  setFullName: (v: string) => void
  phone: string
  setPhone: (v: string) => void
  switching: boolean
  switchErr: string | null
  onSubmit: (e: React.FormEvent) => void
  onSwitchToHiring: () => void
}

function BasicsStepImpl({ t, fullName, setFullName, phone, setPhone, switching, switchErr, onSubmit, onSwitchToHiring }: BasicsStepProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
    >
      <p className="text-sm text-fg-muted">
        {t('talentOnboard.basicsIntro')}
      </p>
      <div>
        <label htmlFor="talent-onboard-full-name" className="block text-sm font-medium text-ink-700 dark:text-fg-strong mb-1">{t('common.fullName')}</label>
        <input
          id="talent-onboard-full-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t('talentOnboard.fullNamePlaceholder')}
          // First wizard field; intentional focus on entry.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="w-full border border-border bg-surface dark:text-fg dark:placeholder-fg-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label htmlFor="talent-onboard-phone" className="block text-sm font-medium text-ink-700 dark:text-fg-strong mb-1">{t('common.phone')}</label>
        <input
          id="talent-onboard-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('talentOnboard.phonePlaceholder')}
          className="w-full border border-border bg-surface dark:text-fg dark:placeholder-fg-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <Button
        type="submit"
        disabled={!fullName.trim() || !phone.trim()}
        className="w-full"
        size="lg"
      >
        {t('talentOnboard.continueToChat')}
      </Button>
      <div className="text-center pt-1">
        <button
          type="button"
          onClick={onSwitchToHiring}
          disabled={switching}
          className="text-xs text-ink-400 dark:text-fg-muted hover:text-ink-600 dark:hover:text-fg-strong underline"
        >
          {switching ? t('talentOnboard.switching') : t('talentOnboard.switchToHiring')}
        </button>
        {switchErr && <p className="text-xs text-red-600 mt-1">{switchErr}</p>}
      </div>
    </form>
  )
}

const BasicsStep = memo(BasicsStepImpl)
export default BasicsStep
