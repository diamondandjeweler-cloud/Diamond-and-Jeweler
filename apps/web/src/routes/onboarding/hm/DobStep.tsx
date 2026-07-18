/**
 * "DOB / consent" wizard step.
 *
 * Relocated verbatim from HMOnboarding.tsx. The date max derivation, the
 * continue-button disabled condition, the gender buttons and the "prefer not
 * to share" skip flow are unchanged — they read the props the parent passes in.
 * The parent owns the underlying useState; this component only reads values +
 * calls setters. The single phase advance (`setPhase('review')`) is injected as
 * `onAdvanceToReview` so the exact order of operations in each onClick is
 * preserved. No logic, validation, or order of operations changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button, Alert } from '../../../components/ui'
import Consent from '../../../components/Consent'
import type { Gender } from '../../../shared/domain/lifeChart/types'

interface DobStepProps {
  t: TFunction
  dob: string
  setDob: (v: string) => void
  gender: Gender | ''
  setGender: (v: Gender | '') => void
  dobConsent: boolean
  setDobConsent: (v: boolean) => void
  dobSkipPrompt: boolean
  setDobSkipPrompt: (v: boolean) => void
  setDobSkipped: (v: boolean) => void
  err: string | null
  onAdvanceToReview: () => void
}

function DobStepImpl({
  t,
  dob, setDob,
  gender, setGender,
  dobConsent, setDobConsent,
  dobSkipPrompt, setDobSkipPrompt,
  setDobSkipped,
  err,
  onAdvanceToReview,
}: DobStepProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600 dark:text-fg-strong">
        {t('hmOnboard.dobIntro')}
      </p>
      <input
        type="date" value={dob} onChange={(e) => { setDob(e.target.value); setDobSkipped(false) }}
        max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10) })()}
        className="w-full border border-border dark:bg-surface dark:text-fg rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="space-y-1">
        <p className="text-sm text-ink-600 dark:text-fg-strong">{t('hmOnboard.genderLabel')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button" onClick={() => { setGender('male'); setDobSkipped(false) }}
            className={`border rounded-lg px-3 py-2 text-sm ${gender === 'male' ? 'bg-brand-500 text-white border-brand-500' : 'border-border text-ink-700 dark:text-fg-strong hover:bg-ink-50 dark:hover:bg-surface'}`}
          >{t('hmOnboard.genderMale')}</button>
          <button
            type="button" onClick={() => { setGender('female'); setDobSkipped(false) }}
            className={`border rounded-lg px-3 py-2 text-sm ${gender === 'female' ? 'bg-brand-500 text-white border-brand-500' : 'border-border text-ink-700 dark:text-fg-strong hover:bg-ink-50 dark:hover:bg-surface'}`}
          >{t('hmOnboard.genderFemale')}</button>
        </div>
      </div>
      <Consent
        checked={dobConsent} onChange={setDobConsent}
        label={t('hmOnboard.dobConsentLabel')}
        required
      />
      {err && <Alert tone="red">{err}</Alert>}
      <Button
        onClick={() => { setDobSkipped(false); onAdvanceToReview() }}
        disabled={!dob || !gender || !dobConsent}
        className="w-full" size="lg"
      >{t('hmOnboard.reviewAndConfirm')}</Button>

      <div className="pt-3 border-t border-border">
        {!dobSkipPrompt ? (
          <button
            type="button" onClick={() => setDobSkipPrompt(true)}
            className="text-xs text-ink-400 dark:text-fg-muted hover:text-ink-600 dark:hover:text-fg-strong underline"
          >{t('hmOnboard.preferNotToShare')}</button>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-sm text-amber-900">
              {t('hmOnboard.dobSkipExplain')}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm" variant="secondary"
                onClick={() => {
                  setDob(''); setGender(''); setDobConsent(false)
                  setDobSkipped(true); setDobSkipPrompt(false); onAdvanceToReview()
                }}
              >{t('hmOnboard.skipAndContinue')}</Button>
              <Button size="sm" onClick={() => setDobSkipPrompt(false)}>{t('hmOnboard.addItNow')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const DobStep = memo(DobStepImpl)
export default DobStep
