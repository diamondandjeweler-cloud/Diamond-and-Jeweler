/**
 * "Must-haves" wizard step — structured role constraints (checkboxes) +
 * free-text additional requirements list.
 *
 * Relocated verbatim from HMOnboarding.tsx. The presentational markup, the
 * local `addItem` helper and the `structuredItems` derivation are unchanged.
 * The phase advance stays in the parent and is passed in as `onContinue`. No
 * logic changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button } from '../../../components/ui'

interface MustHavesStepProps {
  t: TFunction
  hmRequiresDrivingLicense: boolean
  setHmRequiresDrivingLicense: (v: boolean) => void
  hmRequiresWeekends: boolean
  setHmRequiresWeekends: (v: boolean) => void
  hmRequiresTravel: boolean
  setHmRequiresTravel: (v: boolean) => void
  hmRequiresNightShifts: boolean
  setHmRequiresNightShifts: (v: boolean) => void
  hmRequiresRelocation: boolean
  setHmRequiresRelocation: (v: boolean) => void
  hmOnsiteOnly: boolean
  setHmOnsiteOnly: (v: boolean) => void
  hmRequiresOwnTransport: boolean
  setHmRequiresOwnTransport: (v: boolean) => void
  hmHasCommission: boolean
  setHmHasCommission: (v: boolean) => void
  mustHaveItems: string[]
  setMustHaveItems: (updater: (prev: string[]) => string[]) => void
  mustHaveInput: string
  setMustHaveInput: (v: string) => void
  onContinue: () => void
}

function MustHavesStepImpl({
  t,
  hmRequiresDrivingLicense, setHmRequiresDrivingLicense,
  hmRequiresWeekends, setHmRequiresWeekends,
  hmRequiresTravel, setHmRequiresTravel,
  hmRequiresNightShifts, setHmRequiresNightShifts,
  hmRequiresRelocation, setHmRequiresRelocation,
  hmOnsiteOnly, setHmOnsiteOnly,
  hmRequiresOwnTransport, setHmRequiresOwnTransport,
  hmHasCommission, setHmHasCommission,
  mustHaveItems, setMustHaveItems,
  mustHaveInput, setMustHaveInput,
  onContinue,
}: MustHavesStepProps) {
  const addItem = () => {
    const t = mustHaveInput.trim()
    if (!t || mustHaveItems.includes(t)) return
    setMustHaveItems((prev) => [...prev, t])
    setMustHaveInput('')
  }
  const structuredItems = [
    { state: hmRequiresDrivingLicense, setter: setHmRequiresDrivingLicense, label: t('hmOnboard.constraintDrivingLicense') },
    { state: hmRequiresWeekends,       setter: setHmRequiresWeekends,       label: t('hmOnboard.constraintWeekends') },
    { state: hmRequiresTravel,         setter: setHmRequiresTravel,         label: t('hmOnboard.constraintTravel') },
    { state: hmRequiresNightShifts,    setter: setHmRequiresNightShifts,    label: t('hmOnboard.constraintNightShifts') },
    { state: hmRequiresRelocation,     setter: setHmRequiresRelocation,     label: t('hmOnboard.constraintRelocation') },
    { state: hmOnsiteOnly,             setter: setHmOnsiteOnly,             label: t('hmOnboard.constraintOnsiteOnly') },
    { state: hmRequiresOwnTransport,   setter: setHmRequiresOwnTransport,   label: t('hmOnboard.constraintOwnTransport') },
    { state: hmHasCommission,          setter: setHmHasCommission,          label: t('hmOnboard.constraintCommission') },
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">
        {t('hmOnboard.mustHavesIntro')}
      </p>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">{t('hmOnboard.roleConstraintsHeading')}</p>
        {structuredItems.map(({ state, setter, label }) => (
          <label key={label} className="flex items-center gap-3 border border-ink-200 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 transition-colors">
            <input
              type="checkbox" checked={state} onChange={(e) => setter(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 accent-brand-500"
            />
            <span className="text-sm text-ink-800">{label}</span>
          </label>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">{t('hmOnboard.additionalReqHeading')}</p>
        <p className="text-xs text-ink-400 mb-2">{t('hmOnboard.additionalReqHint')}</p>
        <div className="flex gap-2">
          <input
            type="text" value={mustHaveInput} onChange={(e) => setMustHaveInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
            placeholder={t('hmOnboard.additionalReqPlaceholder')}
            className="flex-1 border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            // Wizard step surfaces this input front and centre; intentional focus.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <button
            type="button" onClick={addItem} disabled={!mustHaveInput.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white disabled:opacity-40 hover:bg-brand-600 transition-colors shrink-0"
          >{t('hmOnboard.add')}</button>
        </div>
      </div>

      {mustHaveItems.length > 0 && (
        <ul className="space-y-2">
          {mustHaveItems.map((item) => (
            <li key={item} className="flex items-start gap-2 bg-ink-50 border border-ink-200 rounded-lg px-3 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0 mt-1.5" />
              <span className="flex-1 text-sm text-ink-800">{item}</span>
              <button
                type="button" onClick={() => setMustHaveItems((prev) => prev.filter((i) => i !== item))}
                className="text-ink-400 hover:text-red-500 transition-colors shrink-0 text-base leading-none" aria-label={t('hmOnboard.remove')}
              >×</button>
            </li>
          ))}
        </ul>
      )}

      <Button onClick={onContinue} className="w-full" size="lg">{t('common.continue')}</Button>
    </div>
  )
}

const MustHavesStep = memo(MustHavesStepImpl)
export default MustHavesStep
