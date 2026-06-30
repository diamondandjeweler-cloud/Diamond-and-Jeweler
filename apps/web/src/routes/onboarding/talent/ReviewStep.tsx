/**
 * "Review" wizard step — final summary before the profile is built.
 *
 * Relocated verbatim from TalentOnboarding.tsx. Presentational: it receives
 * the collected values plus the build/back callbacks and busy/err flags as
 * props. The activeConstraints derivation is identical to the original. No
 * logic changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button, Alert } from '../../../components/ui'
import { ReviewRow } from './StepBits'

interface ReviewStepProps {
  t: TFunction
  dob: string
  gender: string
  race: string
  religion: string
  languages: string[]
  locationMatters: boolean | null
  locationPostcode: string
  noWeekendWork: boolean
  noDrivingLicense: boolean
  noTravel: boolean
  noNightShifts: boolean
  noOwnCar: boolean
  remoteOnly: boolean
  noRelocation: boolean
  noOvertime: boolean
  noCommissionOnly: boolean
  minSalaryHard: number | null
  photoFile: File | null
  resumeFile: File | null
  coverLetterFile: File | null
  err: string | null
  busy: boolean
  onBuild: () => void
  onBack: () => void
}

function ReviewStepImpl({
  t,
  dob, gender, race, religion, languages,
  locationMatters, locationPostcode,
  noWeekendWork, noDrivingLicense, noTravel, noNightShifts, noOwnCar,
  remoteOnly, noRelocation, noOvertime, noCommissionOnly,
  minSalaryHard, photoFile, resumeFile, coverLetterFile,
  err, busy, onBuild, onBack,
}: ReviewStepProps) {
  const activeConstraints = [
    noWeekendWork && t('talentOnboard.constraintNoWeekend'),
    noDrivingLicense && t('talentOnboard.constraintNoLicence'),
    noTravel && t('talentOnboard.constraintNoTravel'),
    noNightShifts && t('talentOnboard.constraintNoNightShifts'),
    noOwnCar && t('talentOnboard.constraintNoOwnCar'),
    remoteOnly && t('talentOnboard.constraintRemoteOnly'),
    noRelocation && t('talentOnboard.constraintNoRelocation'),
    noOvertime && t('talentOnboard.constraintNoOvertime'),
    noCommissionOnly && t('talentOnboard.constraintNoCommissionOnly'),
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 dark:text-gray-300 leading-relaxed">
        {t('talentOnboard.reviewIntroLead')} <strong>{t('talentOnboard.buildMyProfile')}</strong> {t('talentOnboard.reviewIntroTail')}
      </p>

      <ReviewRow label={t('talentOnboard.reviewChat')} value={t('talentOnboard.reviewCompleted')} ok />
      <ReviewRow label={t('talentOnboard.reviewDob')} value={dob ? t('talentOnboard.reviewDobValue', { dob }) : '—'} ok={!!dob} />
      <ReviewRow label={t('talentOnboard.reviewGender')} value={gender || '—'} ok={!!gender} />
      <ReviewRow label={t('talentOnboard.reviewRace')} value={race || '—'} ok={!!race} />
      <ReviewRow label={t('talentOnboard.reviewReligion')} value={religion || '—'} ok={!!religion} />
      <ReviewRow label={t('talentOnboard.reviewLanguages')} value={languages.length > 0 ? languages.join(', ') : '—'} ok={languages.length > 0} />
      <ReviewRow label={t('talentOnboard.reviewLocation')} value={locationMatters === true ? t('talentOnboard.reviewPostcode', { postcode: locationPostcode }) : locationMatters === false ? t('talentOnboard.reviewFlexible') : '—'} ok={locationMatters !== null} />
      <ReviewRow
        label={t('talentOnboard.reviewHardConstraints')}
        value={activeConstraints.length > 0 ? activeConstraints.join(' · ') : t('talentOnboard.reviewNoneSet')}
        ok
      />
      {minSalaryHard != null && (
        <ReviewRow label={t('talentOnboard.reviewMinSalary')} value={t('talentOnboard.reviewMinSalaryValue', { amount: minSalaryHard.toLocaleString() })} ok />
      )}
      <ReviewRow label={t('talentOnboard.reviewPhoto')} value={photoFile?.name ?? '—'} ok={!!photoFile} />
      <ReviewRow label={t('talentOnboard.reviewResume')} value={resumeFile?.name ?? '—'} ok={!!resumeFile} />
      {coverLetterFile && <ReviewRow label={t('talentOnboard.reviewCoverLetter')} value={coverLetterFile.name} ok />}

      {err && <Alert tone="red">{err}</Alert>}
      <Button
        onClick={onBuild}
        loading={busy}
        className="w-full"
        size="lg"
      >
        {t('talentOnboard.buildMyProfile')}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-xs text-ink-400 dark:text-gray-400 hover:text-ink-600 dark:hover:text-gray-300 py-1"
      >
        {t('talentOnboard.goBackChange')}
      </button>
    </div>
  )
}

const ReviewStep = memo(ReviewStepImpl)
export default ReviewStep
