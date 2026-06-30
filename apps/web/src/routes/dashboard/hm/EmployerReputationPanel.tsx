import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Badge } from '../../../components/ui'
import type { HmReputation } from './types'

function EmployerReputationPanelImpl({ reputation }: { reputation: HmReputation }) {
  const { t } = useTranslation()
  const score = reputation.reputation_score
  const scoreTone = score == null ? 'gray' : score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red'
  const qf = reputation.hm_quality_factor
  const qfTone = qf == null ? 'gray' : qf >= 0.90 ? 'green' : qf >= 0.80 ? 'amber' : 'red'
  return (
    <Card className="mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-gray-400 mb-0.5">{t('hmDash.reputationTitle')}</p>
            <p className="text-xs text-ink-400 dark:text-gray-400">{t('hmDash.reputationBasedOn', { count: reputation.feedback_volume })}</p>
          </div>
          {score != null && <Badge tone={scoreTone as 'gray' | 'green' | 'amber' | 'brand' | 'accent' | 'red'}>{t('hmDash.scoreOutOf100', { score: Math.round(score) })}</Badge>}
        </div>
        <div className="flex gap-6 flex-wrap">
          {qf != null && (
            <div>
              <p className="text-xs text-ink-500 dark:text-gray-400">{t('hmDash.reliabilityScore')}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-ink-900 dark:text-white">{t('hmDash.scoreOutOf100', { score: (qf * 100).toFixed(0) })}</p>
                <Badge tone={qfTone as 'gray' | 'green' | 'amber' | 'brand' | 'accent' | 'red'} className="text-xs">
                  {qf >= 0.90 ? t('hmDash.reliabilityExcellent') : qf >= 0.80 ? t('hmDash.reliabilityGood') : t('hmDash.reliabilityNeedsAttention')}
                </Badge>
              </div>
              <p className="text-xs text-ink-400 dark:text-gray-400 mt-0.5">{t('hmDash.reliabilityFactors')}</p>
            </div>
          )}
          {reputation.hm_cancel_rate != null && (
            <div>
              <p className="text-xs text-ink-500 dark:text-gray-400">{t('hmDash.cancelRate')}</p>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">{Math.round(reputation.hm_cancel_rate * 100)}%</p>
            </div>
          )}
          {reputation.phs_offer_accept_rate != null && (
            <div>
              <p className="text-xs text-ink-500 dark:text-gray-400">{t('hmDash.offerAcceptRate')}</p>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">{Math.round(reputation.phs_offer_accept_rate * 100)}%</p>
            </div>
          )}
        </div>
        {qf != null && qf < 0.80 && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            {t('hmDash.reliabilityImproveHint')}
          </div>
        )}
      </div>
    </Card>
  )
}

const EmployerReputationPanel = memo(EmployerReputationPanelImpl)
export default EmployerReputationPanel
