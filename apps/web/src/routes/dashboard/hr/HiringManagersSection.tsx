import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Skeleton from '../../../components/Skeleton'
import { Button, Card, EmptyState } from '../../../components/ui'
import { SectionHeader } from './headers'
import type { HMRow } from './types'

/** "Your hiring managers" section. Relocated verbatim from HRDashboard.tsx. */
function HiringManagersSectionImpl({
  hms, isSelfHM, onSwitchToHmView, onAddMe,
}: {
  hms: HMRow[] | null
  isSelfHM: boolean
  onSwitchToHmView: () => void
  onAddMe: () => void
}) {
  const { t } = useTranslation()
  return (
    <section className="mb-10">
      <SectionHeader
        title={t('hrDash.hmSectionTitle')}
        subtitle={t('hrDash.hmSectionSubtitle')}
        count={hms?.length}
        action={<Link to="/hr/invite" className="btn-primary btn-sm">{t('hrDash.inviteHm')}</Link>}
      />
      {hms == null ? (
        // Pre-fetch: show skeleton rows with the same footprint as the
        // real cards so there's no layout shift when data arrives.
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Card key={i}>
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton width={120} height={16} />
                  <Skeleton width={180} height={11} rounded="sm" />
                </div>
                <Skeleton width={120} height={32} />
              </div>
            </Card>
          ))}
        </div>
      ) : hms.length === 0 ? (
        <Card>
          <EmptyState
            title={t('hrDash.hmEmptyTitle')}
            description={t('hrDash.hmEmptyDesc')}
            action={<Link to="/hr/invite" className="btn-primary">{t('hrDash.inviteFirstHm')}</Link>}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {hms.map((h) => (
            <Card key={h.id}>
              <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base text-ink-900">
                      {h.is_self ? t('hrDash.you') : h.full_name}
                    </h3>
                  </div>
                  <div className="text-xs text-ink-500 mt-0.5">
                    {h.job_title} · {t('hrDash.openRoleCount', { count: h.role_count })}
                  </div>
                </div>
                {h.is_self && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={onSwitchToHmView}>
                      {t('hrDash.switchToHmView')}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {!isSelfHM && (
        <div className="mt-3 flex items-center gap-2 text-sm text-ink-600">
          <span>{t('hrDash.alsoHmPrompt')}</span>
          <button
            type="button"
            className="underline text-brand-700 hover:text-brand-800 font-medium"
            onClick={onAddMe}
          >
            {t('hrDash.addMeAsHm')}
          </button>
        </div>
      )}
    </section>
  )
}

const HiringManagersSection = memo(HiringManagersSectionImpl)
export default HiringManagersSection
