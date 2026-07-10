/**
 * "Deal-breakers" wizard step — hard structured filters + free-text items.
 *
 * Relocated verbatim from TalentOnboarding.tsx. The presentational markup,
 * the local `addItem` helper, and the `hasAnyDealBreaker` derivation are
 * unchanged. The AI classification + phase-advance (`handleContinue`, which
 * calls callFunction and guards on the parent's `phase`) stays in the parent
 * and is passed in as `onContinue`. No logic changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button } from '../../../components/ui'

interface DealBreakersStepProps {
  t: TFunction
  noWeekendWork: boolean
  setNoWeekendWork: (v: boolean) => void
  noDrivingLicense: boolean
  setNoDrivingLicense: (v: boolean) => void
  noTravel: boolean
  setNoTravel: (v: boolean) => void
  noNightShifts: boolean
  setNoNightShifts: (v: boolean) => void
  noOwnCar: boolean
  setNoOwnCar: (v: boolean) => void
  remoteOnly: boolean
  setRemoteOnly: (v: boolean) => void
  noRelocation: boolean
  setNoRelocation: (v: boolean) => void
  noOvertime: boolean
  setNoOvertime: (v: boolean) => void
  noCommissionOnly: boolean
  setNoCommissionOnly: (v: boolean) => void
  minSalaryHard: number | null
  setMinSalaryHard: (v: number | null) => void
  dealBreakerItems: string[]
  setDealBreakerItems: (updater: (prev: string[]) => string[]) => void
  dealBreakerInput: string
  setDealBreakerInput: (v: string) => void
  onContinue: () => void
}

function DealBreakersStepImpl({
  t,
  noWeekendWork, setNoWeekendWork,
  noDrivingLicense, setNoDrivingLicense,
  noTravel, setNoTravel,
  noNightShifts, setNoNightShifts,
  noOwnCar, setNoOwnCar,
  remoteOnly, setRemoteOnly,
  noRelocation, setNoRelocation,
  noOvertime, setNoOvertime,
  noCommissionOnly, setNoCommissionOnly,
  minSalaryHard, setMinSalaryHard,
  dealBreakerItems, setDealBreakerItems,
  dealBreakerInput, setDealBreakerInput,
  onContinue,
}: DealBreakersStepProps) {
  const addItem = () => {
    const t2 = dealBreakerInput.trim()
    if (!t2 || dealBreakerItems.includes(t2)) return
    setDealBreakerItems((prev) => [...prev, t2])
    setDealBreakerInput('')
  }
  const hasAnyDealBreaker = noWeekendWork || noDrivingLicense || minSalaryHard != null || dealBreakerItems.length > 0 || noTravel || noNightShifts || noOwnCar || remoteOnly || noRelocation || noOvertime || noCommissionOnly

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted leading-relaxed">
        {t('talentOnboard.dealBreakersIntroLead')} <strong>{t('talentOnboard.dealBreakersIntroBold')}</strong> {t('talentOnboard.dealBreakersIntroTail')}
      </p>

      {/* Quick structured toggles — machine-verified hard filters */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide">{t('talentOnboard.quickFiltersHeader')}</p>
        <label className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 dark:hover:bg-surface transition-colors">
          <input
            type="checkbox"
            checked={noWeekendWork}
            onChange={(e) => setNoWeekendWork(e.target.checked)}
            className="h-4 w-4 rounded border-border-strong accent-brand-500"
          />
          <span className="text-sm text-fg">{t('talentOnboard.dbNoWeekend')}</span>
        </label>
        <label className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 dark:hover:bg-surface transition-colors">
          <input
            type="checkbox"
            checked={noDrivingLicense}
            onChange={(e) => setNoDrivingLicense(e.target.checked)}
            className="h-4 w-4 rounded border-border-strong accent-brand-500"
          />
          <span className="text-sm text-fg">{t('talentOnboard.dbNoLicence')}</span>
        </label>
        {[
          { state: noTravel,         setter: setNoTravel,         label: t('talentOnboard.dbNoTravel') },
          { state: noNightShifts,    setter: setNoNightShifts,    label: t('talentOnboard.dbNoNightShifts') },
          { state: noOwnCar,         setter: setNoOwnCar,         label: t('talentOnboard.dbNoOwnCar') },
          { state: remoteOnly,       setter: setRemoteOnly,       label: t('talentOnboard.dbRemoteOnly') },
          { state: noRelocation,     setter: setNoRelocation,     label: t('talentOnboard.dbNoRelocation') },
          { state: noOvertime,       setter: setNoOvertime,       label: t('talentOnboard.dbNoOvertime') },
          { state: noCommissionOnly, setter: setNoCommissionOnly, label: t('talentOnboard.dbNoCommissionOnly') },
        ].map(({ state, setter, label }) => (
          <label key={label} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 dark:hover:bg-surface transition-colors">
            <input
              type="checkbox"
              checked={state}
              onChange={(e) => setter(e.target.checked)}
              className="h-4 w-4 rounded border-border-strong accent-brand-500"
            />
            <span className="text-sm text-fg">{label}</span>
          </label>
        ))}
        <div className="border border-border rounded-lg px-3 py-2.5">
          <label htmlFor="talent-onboard-min-salary" className="block text-sm text-fg mb-1.5">{t('talentOnboard.minSalaryLabel')}</label>
          <div className="flex items-center gap-2">
            <input
              id="talent-onboard-min-salary"
              type="number"
              min={0}
              step={100}
              value={minSalaryHard ?? ''}
              onChange={(e) => setMinSalaryHard(e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
              placeholder={t('talentOnboard.minSalaryPlaceholder')}
              className="flex-1 border border-border bg-surface dark:text-fg dark:placeholder-fg-subtle rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {minSalaryHard != null && (
              <button
                type="button"
                onClick={() => setMinSalaryHard(null)}
                className="text-ink-400 dark:text-fg-muted hover:text-red-500 text-base leading-none"
                aria-label={t('talentOnboard.clear')}
              >×</button>
            )}
          </div>
        </div>
      </div>

      {/* Free-text additional requirements */}
      <div>
        <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">{t('talentOnboard.anythingElseHeader')}</p>
        <p className="text-xs text-ink-400 dark:text-fg-muted mb-2">{t('talentOnboard.anythingElseHint')}</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={dealBreakerInput}
            onChange={(e) => setDealBreakerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
            placeholder={t('talentOnboard.requirementPlaceholder')}
            className="flex-1 border border-border bg-surface dark:text-fg dark:placeholder-fg-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!dealBreakerInput.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white disabled:opacity-40 hover:bg-brand-600 transition-colors shrink-0"
          >
            {t('talentOnboard.add')}
          </button>
        </div>
      </div>

      {/* Free-text list */}
      {dealBreakerItems.length > 0 && (
        <ul className="space-y-2">
          {dealBreakerItems.map((item) => (
            <li key={item} className="flex items-start gap-2 bg-ink-50 dark:bg-surface border border-border rounded-lg px-3 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
              <span className="flex-1 text-sm text-fg">{item}</span>
              <button
                type="button"
                onClick={() => setDealBreakerItems((prev) => prev.filter((i) => i !== item))}
                className="text-ink-400 dark:text-fg-muted hover:text-red-500 transition-colors shrink-0 text-base leading-none"
                aria-label={t('talentOnboard.remove')}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {!hasAnyDealBreaker && (
        <p className="text-xs text-ink-400 dark:text-fg-muted text-center py-1">{t('talentOnboard.noDealBreakers')}</p>
      )}

      <Button
        onClick={onContinue}
        className="w-full"
        size="lg"
      >
        {hasAnyDealBreaker ? t('common.continue') : t('talentOnboard.skipFlexible')}
      </Button>
    </div>
  )
}

const DealBreakersStep = memo(DealBreakersStepImpl)
export default DealBreakersStep
