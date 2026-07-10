import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, Badge } from '../../../components/ui'

function ExpiryBannerImpl({
  expiresAt, reviving, reviveStep, onReviveClick, onReviveConfirm, onReviveCancel,
}: {
  expiresAt: string | null
  reviving: boolean
  reviveStep: 'idle' | 'confirm'
  onReviveClick: () => void
  onReviveConfirm: () => void
  onReviveCancel: () => void
}) {
  const { t } = useTranslation()
  if (!expiresAt) return null
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
  if (days > 10) return null

  if (days <= 0) {
    if (reviveStep === 'confirm') return (
      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-sm font-semibold text-red-800 mb-0.5">{t('talentDash.reactivateTitle')}</p>
        <p className="text-xs text-red-600 mb-3">
          {t('talentDash.reactivateBody')}
        </p>
        <ul className="text-xs text-ink-700 dark:text-fg-strong space-y-1 mb-4 list-disc list-inside">
          <li>{t('talentDash.checkSalaryRange')}</li>
          <li>{t('talentDash.checkJobTypes')}</li>
          <li>{t('talentDash.checkNoticePeriod')}</li>
          <li>{t('talentDash.checkCareerIntention')}</li>
        </ul>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={onReviveConfirm} loading={reviving} size="sm">{t('talentDash.confirmRevive')}</Button>
          <Link to="/talent/profile" className="btn-secondary text-xs px-3 py-1.5 rounded-md">{t('talentDash.updateFirst')}</Link>
          <button onClick={onReviveCancel} className="text-xs text-ink-400 dark:text-fg-muted hover:text-ink-600 dark:hover:text-fg-strong px-2">{t('talentDash.cancel')}</button>
        </div>
      </div>
    )
    return (
      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-red-800">{t('talentDash.profileExpired')}</p>
          <p className="text-xs text-red-600 mt-0.5">{t('talentDash.profileExpiredBody')}</p>
        </div>
        <Button onClick={onReviveClick} loading={reviving} size="sm">{t('talentDash.reviveProfile')}</Button>
      </div>
    )
  }

  if (reviveStep === 'confirm') return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <p className="text-sm font-semibold text-amber-800 mb-0.5">{t('talentDash.quickCheckTitle')}</p>
      <p className="text-xs text-amber-600 mb-3">
        {t('talentDash.quickCheckBody')}
      </p>
      <ul className="text-xs text-ink-700 dark:text-fg-strong space-y-1 mb-4 list-disc list-inside">
        <li>{t('talentDash.checkSalaryRange')}</li>
        <li>{t('talentDash.checkJobTypes')}</li>
        <li>{t('talentDash.checkNoticePeriod')}</li>
        <li>{t('talentDash.checkCareerIntention')}</li>
      </ul>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={onReviveConfirm} loading={reviving} size="sm" variant="secondary">{t('talentDash.confirmExtend')}</Button>
        <Link to="/talent/profile" className="btn-secondary text-xs px-3 py-1.5 rounded-md">{t('talentDash.updateFirst')}</Link>
        <button onClick={onReviveCancel} className="text-xs text-ink-400 dark:text-fg-muted hover:text-ink-600 dark:hover:text-fg-strong px-2">{t('talentDash.cancel')}</button>
      </div>
    </div>
  )

  return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-amber-800">{t('talentDash.expiresInDays', { count: days })}</p>
        <p className="text-xs text-amber-600 mt-0.5">{t('talentDash.extendNowBody')}</p>
      </div>
      <Button onClick={onReviveClick} loading={reviving} size="sm" variant="secondary">{t('talentDash.extend45Days')}</Button>
    </div>
  )
}

export const ExpiryBanner = memo(ExpiryBannerImpl)

function CareerHealthPanelImpl({ reputation }: {
  reputation: { reputation_score: number | null; feedback_volume: number; phs_show_rate: number | null; phs_accept_rate: number | null }
}) {
  const { t } = useTranslation()
  const score = reputation.reputation_score
  const scoreTone = score == null ? 'gray' : score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red'
  return (
    <Card className="mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted mb-0.5">{t('talentDash.careerHealth')}</p>
            <p className="text-xs text-ink-400 dark:text-fg-muted">{t('talentDash.basedOnReviews', { count: reputation.feedback_volume })}</p>
          </div>
          {score != null && <Badge tone={scoreTone as 'gray' | 'green' | 'amber' | 'brand' | 'accent' | 'red'}>{Math.round(score)} / 100</Badge>}
        </div>
        <div className="flex gap-6 flex-wrap">
          {reputation.phs_show_rate != null && (
            <div>
              <p className="text-xs text-fg-muted">{t('talentDash.interviewAttendance')}</p>
              <p className="text-sm font-semibold text-fg">{Math.round(reputation.phs_show_rate * 100)}%</p>
            </div>
          )}
          {reputation.phs_accept_rate != null && (
            <div>
              <p className="text-xs text-fg-muted">{t('talentDash.offerAcceptance')}</p>
              <p className="text-sm font-semibold text-fg">{Math.round(reputation.phs_accept_rate * 100)}%</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export const CareerHealthPanel = memo(CareerHealthPanelImpl)

const TOTAL_PROFILE_FIELDS = 12

function ProfileCompletenessBarImpl({ gaps }: { gaps: string[] }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const filled = TOTAL_PROFILE_FIELDS - gaps.length
  const pct = Math.round((filled / TOTAL_PROFILE_FIELDS) * 100)
  const barTone = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <Card className="mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t('talentDash.completenessTitle')}</p>
            <p className="text-xs text-ink-400 dark:text-fg-muted mt-0.5">
              {pct >= 80
                ? t('talentDash.completenessHigh')
                : pct >= 50
                ? t('talentDash.completenessMid')
                : t('talentDash.completenessLow')}
            </p>
          </div>
          <span className={`text-sm font-bold ${pct >= 80 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-600'}`}>
            {pct}%
          </span>
        </div>
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden mb-3">
          <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${pct}%` }} />
        </div>
        {gaps.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              {expanded ? t('talentDash.hide') : t('talentDash.fieldsMissing', { count: gaps.length })}
            </button>
            {expanded && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {gaps.map((g) => (
                  <span key={g} className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                    {t(g)}
                  </span>
                ))}
                <a href="/talent/profile" className="text-xs text-brand-600 hover:text-brand-700 underline ml-1">
                  {t('talentDash.updateProfile')}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

export const ProfileCompletenessBar = memo(ProfileCompletenessBarImpl)
