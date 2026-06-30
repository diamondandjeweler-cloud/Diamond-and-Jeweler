/**
 * "Extras" wizard step (structured matching extras — skills, languages,
 * candidate types, shifts, environment, non-negotiables).
 *
 * Relocated verbatim from TalentOnboarding.tsx. Purely presentational: it
 * receives its values + setters as props and wires them to the role-form
 * components exactly as before. No logic changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button } from '../../../components/ui'
import {
  SkillChipInput, LanguageRequirement, EnvironmentFlags, OpenToSelect,
  AvailableShifts, NonNegotiablesInput,
  type LanguageReq, type NNAtom,
} from '../../../components/role-form'

interface ExtrasStepProps {
  t: TFunction
  skills: string[]
  setSkills: (v: string[]) => void
  languages: string[]
  languagesProficiency: LanguageReq[]
  setLanguagesProficiency: (v: LanguageReq[]) => void
  candidateTypes: string[]
  setCandidateTypes: (v: string[]) => void
  availableDaysPerWeek: number | ''
  setAvailableDaysPerWeek: (v: number | '') => void
  availableShifts: string[]
  setAvailableShifts: (v: string[]) => void
  environmentPreferences: string[]
  setEnvironmentPreferences: (v: string[]) => void
  priorityConcernsText: string
  setPriorityConcernsText: (v: string) => void
  priorityConcernsAtoms: NNAtom[]
  setPriorityConcernsAtoms: (v: NNAtom[]) => void
  onContinue: () => void
}

function ExtrasStepImpl({
  t,
  skills, setSkills,
  languages,
  languagesProficiency, setLanguagesProficiency,
  candidateTypes, setCandidateTypes,
  availableDaysPerWeek, setAvailableDaysPerWeek,
  availableShifts, setAvailableShifts,
  environmentPreferences, setEnvironmentPreferences,
  priorityConcernsText, setPriorityConcernsText,
  priorityConcernsAtoms, setPriorityConcernsAtoms,
  onContinue,
}: ExtrasStepProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-600 dark:text-gray-300 leading-relaxed">
        {t('talentOnboard.extrasIntro')}
      </p>

      <SkillChipInput
        label={t('talentOnboard.skillsLabel')}
        hint={t('talentOnboard.skillsHint')}
        value={skills}
        onChange={setSkills}
        max={20}
      />

      <LanguageRequirement
        label={t('talentOnboard.langProficiencyLabel')}
        hint={t('talentOnboard.langProficiencyHint')}
        value={languagesProficiency.length > 0 ? languagesProficiency : languages.map((code) => ({ code, level: 'conversational' as const }))}
        onChange={setLanguagesProficiency}
        side="talent"
      />

      <OpenToSelect
        label={t('talentOnboard.identifyAsLabel')}
        hint={t('talentOnboard.identifyAsHint')}
        value={candidateTypes}
        onChange={setCandidateTypes}
        side="talent"
      />

      <div className="space-y-2">
        <div className="field-label">{t('talentOnboard.daysPerWeekLabel')}</div>
        <input
          type="number"
          min={1}
          max={7}
          value={availableDaysPerWeek === '' ? '' : availableDaysPerWeek}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            setAvailableDaysPerWeek(Number.isFinite(n) ? Math.max(1, Math.min(7, n)) : '')
          }}
          placeholder={t('talentOnboard.daysPerWeekPlaceholder')}
          className="w-full border border-ink-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <AvailableShifts value={availableShifts} onChange={setAvailableShifts} />

      <EnvironmentFlags
        label={t('talentOnboard.environmentsLabel')}
        hint={t('talentOnboard.environmentsHint')}
        value={environmentPreferences}
        onChange={setEnvironmentPreferences}
      />

      <div className="pt-4 border-t border-ink-100 dark:border-gray-700">
        <NonNegotiablesInput
          text={priorityConcernsText}
          atoms={priorityConcernsAtoms}
          onChange={({ text, atoms }) => {
            setPriorityConcernsText(text)
            setPriorityConcernsAtoms(atoms)
          }}
          side="talent"
        />
      </div>

      <Button
        onClick={onContinue}
        className="w-full"
        size="lg"
      >
        {t('common.continue')}
      </Button>
    </div>
  )
}

const ExtrasStep = memo(ExtrasStepImpl)
export default ExtrasStep
