/**
 * "Demographics" wizard step — race, religion, languages, office location.
 *
 * Relocated verbatim from HMOnboarding.tsx. Purely presentational: it receives
 * its values + setters as props and the phase advance as `onContinue`. The
 * continue-button disabled derivation is identical to the original. No logic
 * changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button } from '../../../components/ui'

interface DemographicsStepProps {
  t: TFunction
  race: string
  setRace: (v: string) => void
  religion: string
  setReligion: (v: string) => void
  languages: string[]
  setLanguages: (updater: (prev: string[]) => string[]) => void
  locationMatters: boolean | null
  setLocationMatters: (v: boolean | null) => void
  locationPostcode: string
  setLocationPostcode: (v: string) => void
  onContinue: () => void
}

function DemographicsStepImpl({
  t,
  race, setRace,
  religion, setReligion,
  languages, setLanguages,
  locationMatters, setLocationMatters,
  locationPostcode, setLocationPostcode,
  onContinue,
}: DemographicsStepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">
        {t('hmOnboard.demographicsIntro')}
      </p>
      <div className="space-y-1">
        <p className="text-sm text-ink-600">{t('hmOnboard.raceLabel')}</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'Malay',   label: t('hmOnboard.raceMalay') },
            { value: 'Chinese', label: t('hmOnboard.raceChinese') },
            { value: 'Indian',  label: t('hmOnboard.raceIndian') },
            { value: 'Others',  label: t('hmOnboard.raceOthers') },
          ] as const).map((r) => (
            <button
              key={r.value} type="button" onClick={() => setRace(r.value.toLowerCase())}
              className={`border rounded-lg px-3 py-2 text-sm ${race === r.value.toLowerCase() ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
            >{r.label}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-ink-600">{t('hmOnboard.religionLabel')}</p>
        <select
          value={religion} onChange={(e) => setReligion(e.target.value)}
          className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="">{t('hmOnboard.religionSelect')}</option>
          <option value="islam">{t('hmOnboard.religionIslam')}</option>
          <option value="christianity">{t('hmOnboard.religionChristianity')}</option>
          <option value="buddhism">{t('hmOnboard.religionBuddhism')}</option>
          <option value="hinduism">{t('hmOnboard.religionHinduism')}</option>
          <option value="taoism">{t('hmOnboard.religionTaoism')}</option>
          <option value="chinese_folk">{t('hmOnboard.religionChineseFolk')}</option>
          <option value="no_religion">{t('hmOnboard.religionNone')}</option>
          <option value="others">{t('hmOnboard.religionOthers')}</option>
        </select>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-ink-600">{t('hmOnboard.languagesLabel')}</p>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'english',          label: t('hmOnboard.langEnglish') },
            { value: 'bahasa_malaysia',  label: t('hmOnboard.langBahasaMalaysia') },
            { value: 'mandarin',         label: t('hmOnboard.langMandarin') },
            { value: 'cantonese',        label: t('hmOnboard.langCantonese') },
            { value: 'hokkien',          label: t('hmOnboard.langHokkien') },
            { value: 'hakka',            label: t('hmOnboard.langHakka') },
            { value: 'teochew',          label: t('hmOnboard.langTeochew') },
            { value: 'tamil',            label: t('hmOnboard.langTamil') },
            { value: 'others',           label: t('hmOnboard.langOthers') },
          ].map(({ value, label }) => {
            const active = languages.includes(value)
            return (
              <button
                key={value} type="button"
                onClick={() => setLanguages((prev) => active ? prev.filter((l) => l !== value) : [...prev, value])}
                className={`border rounded-full px-3 py-1.5 text-xs ${active ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >{label}</button>
            )
          })}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-ink-600">{t('hmOnboard.locationLabel')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button" onClick={() => setLocationMatters(true)}
            className={`border rounded-lg px-3 py-2 text-sm ${locationMatters === true ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
          >{t('hmOnboard.locationYes')}</button>
          <button
            type="button" onClick={() => { setLocationMatters(false); setLocationPostcode('') }}
            className={`border rounded-lg px-3 py-2 text-sm ${locationMatters === false ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
          >{t('hmOnboard.locationNo')}</button>
        </div>
        {locationMatters === true && (
          <input
            type="text" inputMode="numeric" pattern="[0-9]{5}" maxLength={5}
            value={locationPostcode} onChange={(e) => setLocationPostcode(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={t('hmOnboard.postcodePlaceholder')}
            className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        )}
      </div>
      <Button
        onClick={onContinue}
        disabled={!race || !religion || languages.length === 0 || locationMatters === null || (locationMatters === true && locationPostcode.length !== 5)}
        className="w-full" size="lg"
      >{t('common.continue')}</Button>
    </div>
  )
}

const DemographicsStep = memo(DemographicsStepImpl)
export default DemographicsStep
