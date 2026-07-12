/**
 * "DOB / background" wizard step.
 *
 * Relocated verbatim from TalentOnboarding.tsx. All derived validation
 * (missingFields, allValid, showErr, error styling helpers) and the Continue
 * button's onClick logic are unchanged — they are computed from the props the
 * parent passes in. The parent owns the underlying useState; this component
 * only reads values + calls setters. No logic, validation math, or order of
 * operations changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button, Alert } from '../../../components/ui'
import { RadioGroup } from '../../../ui/RadioGroup'
import Consent from '../../../components/Consent'
import type { Gender } from '../../../shared/domain/lifeChart/lifeChartCharacter'

interface DobStepProps {
  t: TFunction
  dob: string
  setDob: (v: string) => void
  gender: Gender | ''
  setGender: (v: Gender) => void
  race: string
  setRace: (v: string) => void
  religion: string
  setReligion: (v: string) => void
  languages: string[]
  setLanguages: (updater: (prev: string[]) => string[]) => void
  locationMatters: boolean | null
  setLocationMatters: (v: boolean) => void
  locationPostcode: string
  setLocationPostcode: (v: string) => void
  openToNewField: boolean
  setOpenToNewField: (v: boolean) => void
  dobConsent: boolean
  setDobConsent: (v: boolean) => void
  dobAttempted: boolean
  setDobAttempted: (v: boolean) => void
  err: string | null
  setErr: (v: string | null) => void
  onValidContinue: () => void
}

function DobStepImpl({
  t,
  dob, setDob,
  gender, setGender,
  race, setRace,
  religion, setReligion,
  languages, setLanguages,
  locationMatters, setLocationMatters,
  locationPostcode, setLocationPostcode,
  openToNewField, setOpenToNewField,
  dobConsent, setDobConsent,
  dobAttempted, setDobAttempted,
  err, setErr,
  onValidContinue,
}: DobStepProps) {
  const dobValid = !!dob
  const genderValid = !!gender
  const raceValid = !!race
  const religionValid = !!religion
  const languagesValid = languages.length > 0
  const locationMattersValid = locationMatters !== null
  const postcodeValid = locationMatters !== true || locationPostcode.length === 5
  const dobConsentValid = dobConsent

  const showErr = (valid: boolean) => dobAttempted && !valid

  const missingFields: string[] = []
  if (!dobValid) missingFields.push(t('talentOnboard.fieldDob'))
  if (!genderValid) missingFields.push(t('talentOnboard.fieldGender'))
  if (!raceValid) missingFields.push(t('talentOnboard.fieldRace'))
  if (!religionValid) missingFields.push(t('talentOnboard.fieldReligion'))
  if (!languagesValid) missingFields.push(t('talentOnboard.fieldLanguage'))
  if (!locationMattersValid) missingFields.push(t('talentOnboard.fieldCommute'))
  if (locationMatters === true && !postcodeValid) missingFields.push(t('talentOnboard.fieldPostcode'))
  if (!dobConsentValid) missingFields.push(t('talentOnboard.fieldDobConsent'))

  const allValid = missingFields.length === 0

  const inputErrCls = (valid: boolean) =>
    showErr(valid) ? 'border-red-400 bg-red-50' : 'border-border bg-surface dark:text-fg'
  const ringWrap = (valid: boolean) =>
    showErr(valid) ? 'rounded-lg ring-2 ring-red-300 p-1.5' : ''

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
        <strong>{t('talentOnboard.dobRequiredLead')}</strong> {t('talentOnboard.dobRequiredBody')}{' '}
        <strong>{t('talentOnboard.dobNeverShown')}</strong> {t('talentOnboard.dobRequiredTail')}
      </div>
      <p className="text-xs text-fg-muted">
        {t('talentOnboard.ageRequirementLead')} <strong>{t('talentOnboard.ageRequirementBold')}</strong> {t('talentOnboard.ageRequirementTail')}
      </p>
      <input
        type="date"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
        max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10) })()}
        data-dob-invalid={showErr(dobValid) ? 'true' : undefined}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${inputErrCls(dobValid)}`}
      />
      <div className="space-y-1" data-dob-invalid={showErr(genderValid) ? 'true' : undefined}>
        <p id="talent-dob-gender-label" className={`text-sm ${showErr(genderValid) ? 'text-red-600 font-medium' : 'text-fg-muted'}`}>
          {t('talentOnboard.genderLabel')}{showErr(genderValid) && <span className="ml-1 text-xs">{t('talentOnboard.requiredParen')}</span>}
        </p>
        <RadioGroup
          variant="segmented"
          aria-labelledby="talent-dob-gender-label"
          value={gender}
          onValueChange={(v) => setGender(v as Gender)}
          className={`grid grid-cols-2 gap-2 ${ringWrap(genderValid)}`}
        >
          <RadioGroup.Item value="male" label={t('talentOnboard.male')} />
          <RadioGroup.Item value="female" label={t('talentOnboard.female')} />
        </RadioGroup>
      </div>
      <div className="space-y-1" data-dob-invalid={showErr(raceValid) ? 'true' : undefined}>
        <p id="talent-dob-race-label" className={`text-sm ${showErr(raceValid) ? 'text-red-600 font-medium' : 'text-fg-muted'}`}>
          {t('talentOnboard.raceLabel')}{showErr(raceValid) && <span className="ml-1 text-xs">{t('talentOnboard.requiredParen')}</span>}
        </p>
        <RadioGroup
          variant="segmented"
          aria-labelledby="talent-dob-race-label"
          value={race}
          onValueChange={setRace}
          className={`grid grid-cols-2 gap-2 ${ringWrap(raceValid)}`}
        >
          {([
            { value: 'malay', label: t('talentOnboard.raceMalay') },
            { value: 'chinese', label: t('talentOnboard.raceChinese') },
            { value: 'indian', label: t('talentOnboard.raceIndian') },
            { value: 'others', label: t('talentOnboard.raceOthers') },
          ] as const).map((r) => (
            <RadioGroup.Item key={r.value} value={r.value} label={r.label} />
          ))}
        </RadioGroup>
      </div>
      <div className="space-y-1" data-dob-invalid={showErr(religionValid) ? 'true' : undefined}>
        <p className={`text-sm ${showErr(religionValid) ? 'text-red-600 font-medium' : 'text-fg-muted'}`}>
          {t('talentOnboard.religionLabel')}{showErr(religionValid) && <span className="ml-1 text-xs">{t('talentOnboard.requiredParen')}</span>}
        </p>
        <select
          value={religion}
          onChange={(e) => setReligion(e.target.value)}
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface dark:text-fg ${inputErrCls(religionValid)}`}
        >
          <option value="">{t('talentOnboard.selectPlaceholder')}</option>
          <option value="islam">{t('talentOnboard.religionIslam')}</option>
          <option value="christianity">{t('talentOnboard.religionChristianity')}</option>
          <option value="buddhism">{t('talentOnboard.religionBuddhism')}</option>
          <option value="hinduism">{t('talentOnboard.religionHinduism')}</option>
          <option value="taoism">{t('talentOnboard.religionTaoism')}</option>
          <option value="chinese_folk">{t('talentOnboard.religionChineseFolk')}</option>
          <option value="no_religion">{t('talentOnboard.religionNone')}</option>
          <option value="others">{t('talentOnboard.religionOthers')}</option>
        </select>
      </div>
      <div className="space-y-1" data-dob-invalid={showErr(languagesValid) ? 'true' : undefined}>
        <p className={`text-sm ${showErr(languagesValid) ? 'text-red-600 font-medium' : 'text-fg-muted'}`}>
          {t('talentOnboard.languagesLabel')}
          {showErr(languagesValid) && <span className="ml-1 text-xs">{t('talentOnboard.pickAtLeastOne')}</span>}
        </p>
        <div className={`flex flex-wrap gap-2 ${ringWrap(languagesValid)}`}>
          {[
            { value: 'english', label: t('talentOnboard.langEnglish') },
            { value: 'bahasa_malaysia', label: t('talentOnboard.langBahasaMalaysia') },
            { value: 'mandarin', label: t('talentOnboard.langMandarin') },
            { value: 'cantonese', label: t('talentOnboard.langCantonese') },
            { value: 'hokkien', label: t('talentOnboard.langHokkien') },
            { value: 'hakka', label: t('talentOnboard.langHakka') },
            { value: 'teochew', label: t('talentOnboard.langTeochew') },
            { value: 'tamil', label: t('talentOnboard.langTamil') },
            { value: 'others', label: t('talentOnboard.langOthers') },
          ].map(({ value, label }) => {
            const active = languages.includes(value)
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setLanguages((prev) => active ? prev.filter((l) => l !== value) : [...prev, value])}
                className={`border rounded-full px-3 py-1.5 text-xs ${active ? 'bg-brand-500 text-white border-brand-500' : 'border-border text-ink-700 dark:text-fg-strong hover:bg-ink-50 dark:hover:bg-surface'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
      <div
        className="space-y-1"
        data-dob-invalid={showErr(locationMattersValid) || (locationMatters === true && showErr(postcodeValid)) ? 'true' : undefined}
      >
        <p id="talent-dob-commute-label" className={`text-sm ${showErr(locationMattersValid) ? 'text-red-600 font-medium' : 'text-fg-muted'}`}>
          {t('talentOnboard.commuteQuestion')}
          {showErr(locationMattersValid) && <span className="ml-1 text-xs">{t('talentOnboard.requiredParen')}</span>}
        </p>
        <RadioGroup
          variant="segmented"
          aria-labelledby="talent-dob-commute-label"
          value={locationMatters === true ? 'yes' : locationMatters === false ? 'no' : ''}
          onValueChange={(v) => {
            if (v === 'yes') setLocationMatters(true)
            else { setLocationMatters(false); setLocationPostcode('') }
          }}
          className={`grid grid-cols-2 gap-2 ${ringWrap(locationMattersValid)}`}
        >
          <RadioGroup.Item value="yes" label={t('talentOnboard.commuteYes')} />
          <RadioGroup.Item value="no" label={t('talentOnboard.commuteNo')} />
        </RadioGroup>
        {locationMatters === true && (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            value={locationPostcode}
            onChange={(e) => setLocationPostcode(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={t('talentOnboard.postcodePlaceholder')}
            className={`w-full border rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-brand-500 ${inputErrCls(postcodeValid)}`}
          />
        )}
        {locationMatters === true && showErr(postcodeValid) && (
          <p className="text-xs text-red-600 mt-1">{t('talentOnboard.postcodeError')}</p>
        )}
      </div>
      <label htmlFor="talent-onboard-open-new-field" className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          id="talent-onboard-open-new-field"
          type="checkbox"
          checked={openToNewField}
          onChange={(e) => setOpenToNewField(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium text-fg">{t('talentOnboard.openNewFieldLabel')}</span>
          <span className="block text-xs text-fg-muted mt-0.5">
            {t('talentOnboard.openNewFieldHint')}
          </span>
        </span>
      </label>
      <div
        className={ringWrap(dobConsentValid)}
        data-dob-invalid={showErr(dobConsentValid) ? 'true' : undefined}
      >
        <Consent
          checked={dobConsent}
          onChange={setDobConsent}
          label={t('talentOnboard.dobConsentLabel')}
          required
        />
        {showErr(dobConsentValid) && (
          <p className="text-xs text-red-600 mt-1">{t('talentOnboard.tickToContinue')}</p>
        )}
      </div>
      {dobAttempted && !allValid && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-xs text-red-900">
          <p className="font-semibold mb-1">{t('talentOnboard.fillToContinue')}</p>
          <ul className="list-disc list-inside space-y-0.5">
            {missingFields.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}
      <Button
        onClick={() => {
          if (!allValid) {
            setDobAttempted(true)
            setTimeout(() => {
              const el = document.querySelector('[data-dob-invalid="true"]') as HTMLElement | null
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, 0)
            return
          }
          // Server-side belt: also enforce 18+ here in case max attribute is bypassed.
          if (dob) {
            const dobMs = new Date(dob).getTime()
            const minAgeDate = new Date(); minAgeDate.setFullYear(minAgeDate.getFullYear() - 18)
            if (dobMs > minAgeDate.getTime()) {
              setErr(t('talentOnboard.age18Error'))
              return
            }
          }
          setErr(null)
          onValidContinue()
        }}
        className="w-full"
        size="lg"
      >
        {t('common.continue')}
      </Button>
      {err && <Alert tone="red">{err}</Alert>}
    </div>
  )
}

const DobStep = memo(DobStepImpl)
export default DobStep
