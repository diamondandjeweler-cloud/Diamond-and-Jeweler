/**
 * "Review" wizard step — final summary before the HM profile is built.
 *
 * Relocated verbatim from HMOnboarding.tsx. Presentational: it receives the
 * collected values plus the build/back callbacks and busy/err flags as props.
 * The `activeConstraints` derivation and every conditional row are identical to
 * the original. The build (`setPhase('submit'); void finalise()`) and back
 * (`setErr(null); setPhase('dob')`) actions stay in the parent and are passed
 * in as `onBuild` / `onBack`. No logic changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button, Alert } from '../../../components/ui'
import { HMReviewRow } from './StepBits'

interface ReviewStepProps {
  t: TFunction
  dob: string
  gender: string
  dobSkipped: boolean
  race: string
  religion: string
  languages: string[]
  locationMatters: boolean | null
  locationPostcode: string
  hmRequiresDrivingLicense: boolean
  hmRequiresWeekends: boolean
  hmRequiresTravel: boolean
  hmRequiresNightShifts: boolean
  hmRequiresRelocation: boolean
  hmOnsiteOnly: boolean
  hmRequiresOwnTransport: boolean
  hmHasCommission: boolean
  mustHaveItems: string[]
  budgetApproved: string
  deadlineToFill: string
  interviewRoundsHM: number | null
  salaryFlex: boolean | null
  failureAt90Days: string
  err: string | null
  busy: boolean
  onBuild: () => void
  onBack: () => void
}

function ReviewStepImpl({
  t,
  dob, gender, dobSkipped,
  race, religion, languages,
  locationMatters, locationPostcode,
  hmRequiresDrivingLicense, hmRequiresWeekends, hmRequiresTravel, hmRequiresNightShifts,
  hmRequiresRelocation, hmOnsiteOnly, hmRequiresOwnTransport, hmHasCommission,
  mustHaveItems,
  budgetApproved, deadlineToFill, interviewRoundsHM, salaryFlex, failureAt90Days,
  err, busy, onBuild, onBack,
}: ReviewStepProps) {
  const activeConstraints = [
    hmRequiresDrivingLicense && t('hmOnboard.reviewConstraintDrivingLicense'),
    hmRequiresWeekends       && t('hmOnboard.reviewConstraintWeekends'),
    hmRequiresTravel         && t('hmOnboard.reviewConstraintTravel'),
    hmRequiresNightShifts    && t('hmOnboard.reviewConstraintNightShifts'),
    hmRequiresRelocation     && t('hmOnboard.reviewConstraintRelocation'),
    hmOnsiteOnly             && t('hmOnboard.reviewConstraintOnsiteOnly'),
    hmRequiresOwnTransport   && t('hmOnboard.reviewConstraintOwnTransport'),
    hmHasCommission          && t('hmOnboard.reviewConstraintCommission'),
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 dark:text-gray-300 leading-relaxed">
        {t('hmOnboard.reviewIntro')}
      </p>

      <HMReviewRow label={t('hmOnboard.reviewChat')} value={t('hmOnboard.reviewCompleted')} ok />
      <HMReviewRow
        label={t('hmOnboard.reviewDob')}
        value={dob ? t('hmOnboard.reviewDobValue', { dob }) : dobSkipped ? t('hmOnboard.reviewDobSkipped') : '—'}
        ok={!!dob}
      />
      <HMReviewRow label={t('hmOnboard.reviewGender')} value={gender || (dobSkipped ? t('hmOnboard.reviewSkipped') : '—')} ok={!!gender} />
      <HMReviewRow label={t('hmOnboard.reviewRace')} value={race || '—'} ok={!!race} />
      <HMReviewRow label={t('hmOnboard.reviewReligion')} value={religion || '—'} ok={!!religion} />
      <HMReviewRow label={t('hmOnboard.reviewLanguages')} value={languages.length > 0 ? languages.join(', ') : '—'} ok={languages.length > 0} />
      <HMReviewRow label={t('hmOnboard.reviewOfficeLocation')} value={locationMatters === true ? t('hmOnboard.reviewPostcode', { postcode: locationPostcode }) : locationMatters === false ? t('hmOnboard.reviewOpenLocation') : '—'} ok={locationMatters !== null} />
      <HMReviewRow label={t('hmOnboard.reviewRoleConstraints')} value={activeConstraints.length > 0 ? activeConstraints.join(' · ') : t('hmOnboard.reviewNoneSet')} ok />
      {mustHaveItems.length > 0 && <HMReviewRow label={t('hmOnboard.reviewAdditionalReq')} value={mustHaveItems.join(' · ')} ok />}
      <HMReviewRow label={t('hmOnboard.reviewBudgetApproved')} value={budgetApproved || t('hmOnboard.reviewNotSpecified')} ok={!!budgetApproved} />
      {deadlineToFill && <HMReviewRow label={t('hmOnboard.reviewDeadline')} value={deadlineToFill} ok />}
      {interviewRoundsHM != null && <HMReviewRow label={t('hmOnboard.reviewInterviewRounds')} value={String(interviewRoundsHM)} ok />}
      {salaryFlex != null && <HMReviewRow label={t('hmOnboard.reviewSalaryFlex')} value={salaryFlex ? t('hmOnboard.reviewNegotiable') : t('hmOnboard.reviewFixedBand')} ok />}
      {failureAt90Days && <HMReviewRow label={t('hmOnboard.reviewFailure90')} value={failureAt90Days} ok />}

      {err && <Alert tone="red">{err}</Alert>}
      <Button onClick={onBuild} loading={busy} className="w-full" size="lg">
        {t('hmOnboard.buildProfile')}
      </Button>
      <button
        type="button" onClick={onBack}
        className="w-full text-xs text-ink-400 dark:text-gray-400 hover:text-ink-600 dark:hover:text-gray-300 py-1"
      >{t('hmOnboard.goBackChange')}</button>
    </div>
  )
}

const ReviewStep = memo(ReviewStepImpl)
export default ReviewStep
