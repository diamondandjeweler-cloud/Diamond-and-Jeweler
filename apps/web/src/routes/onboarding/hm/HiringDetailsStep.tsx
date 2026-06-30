/**
 * "Hiring details" wizard step — budget, deadline, interview rounds, salary
 * flexibility, and the optional 90-day-failure description.
 *
 * Relocated verbatim from HMOnboarding.tsx. Purely presentational: it receives
 * its values + setters as props and the phase advance as `onContinue`. No logic
 * changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button } from '../../../components/ui'

interface HiringDetailsStepProps {
  t: TFunction
  budgetApproved: string
  setBudgetApproved: (v: string) => void
  deadlineToFill: string
  setDeadlineToFill: (v: string) => void
  interviewRoundsHM: number | null
  setInterviewRoundsHM: (v: number | null) => void
  salaryFlex: boolean | null
  setSalaryFlex: (v: boolean | null) => void
  failureAt90Days: string
  setFailureAt90Days: (v: string) => void
  onContinue: () => void
}

function HiringDetailsStepImpl({
  t,
  budgetApproved, setBudgetApproved,
  deadlineToFill, setDeadlineToFill,
  interviewRoundsHM, setInterviewRoundsHM,
  salaryFlex, setSalaryFlex,
  failureAt90Days, setFailureAt90Days,
  onContinue,
}: HiringDetailsStepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">
        {t('hmOnboard.hiringDetailsIntro')}
      </p>

      {/* Budget */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink-700">{t('hmOnboard.budgetLabel')}</p>
        <div className="grid grid-cols-3 gap-2">
          {(['yes', 'pending', 'unknown'] as const).map((v) => (
            <button
              key={v} type="button" onClick={() => setBudgetApproved(v)}
              className={`border rounded-lg px-3 py-2 text-sm capitalize ${budgetApproved === v ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
            >{v === 'yes' ? t('hmOnboard.budgetYes') : v === 'pending' ? t('hmOnboard.budgetPending') : t('hmOnboard.budgetUnknown')}</button>
          ))}
        </div>
        {budgetApproved === 'pending' && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
            {t('hmOnboard.budgetPendingNote')}
          </p>
        )}
      </div>

      {/* Deadline */}
      <div className="space-y-1">
        <label htmlFor="hm-onboard-deadline" className="block text-sm font-medium text-ink-700">{t('hmOnboard.deadlineLabel')}</label>
        <input
          id="hm-onboard-deadline"
          type="date" value={deadlineToFill} onChange={(e) => setDeadlineToFill(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Interview rounds */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink-700">{t('hmOnboard.interviewRoundsLabel')}</p>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n} type="button" onClick={() => setInterviewRoundsHM(n)}
              className={`border rounded-lg px-3 py-2 text-sm ${interviewRoundsHM === n ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
            >{n}{n === 4 ? '+' : ''}</button>
          ))}
        </div>
      </div>

      {/* Salary flex */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink-700">{t('hmOnboard.salaryFlexLabel')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button" onClick={() => setSalaryFlex(true)}
            className={`border rounded-lg px-3 py-2 text-sm ${salaryFlex === true ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
          >{t('hmOnboard.salaryFlexYes')}</button>
          <button
            type="button" onClick={() => setSalaryFlex(false)}
            className={`border rounded-lg px-3 py-2 text-sm ${salaryFlex === false ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
          >{t('hmOnboard.salaryFlexNo')}</button>
        </div>
      </div>

      {/* Failure at 90 days */}
      <div className="space-y-1">
        <label htmlFor="hm-onboard-failure-90d" className="block text-sm font-medium text-ink-700">
          {t('hmOnboard.failure90Label')} <span className="text-ink-400 font-normal">{t('hmOnboard.optionalParen')}</span>
        </label>
        <p className="text-xs text-ink-400">{t('hmOnboard.failure90Hint')}</p>
        <textarea
          id="hm-onboard-failure-90d"
          value={failureAt90Days} onChange={(e) => setFailureAt90Days(e.target.value)}
          rows={3} placeholder={t('hmOnboard.failure90Placeholder')}
          className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
      </div>

      <Button onClick={onContinue} className="w-full" size="lg">{t('common.continue')}</Button>
    </div>
  )
}

const HiringDetailsStep = memo(HiringDetailsStepImpl)
export default HiringDetailsStep
