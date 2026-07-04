import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import Skeleton from '../../../components/Skeleton'
import { Card, EmptyState } from '../../../components/ui'
import { Async } from '../../../components/patterns/Async'
import { SectionHeader } from './headers'
import type { HMRow, OpenRoleRow } from './types'

/** "Open roles" section. Relocated verbatim from HRDashboard.tsx. The empty
 *  description still keys off the HM count to pick the right copy. */
function OpenRolesSectionImpl({
  openRoles, hms,
}: {
  openRoles: OpenRoleRow[] | null
  hms: HMRow[] | null
}) {
  const { t } = useTranslation()
  return (
    <section className="mb-10">
      <SectionHeader
        title={t('hrDash.openRolesTitle')}
        subtitle={t('hrDash.openRolesSubtitle')}
        count={openRoles?.length}
      />
      <Async
        data={openRoles ?? undefined}
        isLoading={openRoles == null}
        loading={
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Card key={i}>
                <div className="p-4 space-y-2">
                  <Skeleton width={200} height={16} />
                  <Skeleton width={120} height={11} rounded="sm" />
                </div>
              </Card>
            ))}
          </div>
        }
        empty={
          <Card>
            <EmptyState
              title={t('hrDash.openRolesEmptyTitle')}
              description={
                (hms?.length ?? 0) === 0
                  ? t('hrDash.openRolesEmptyNoHm')
                  : t('hrDash.openRolesEmptyNoRoles')
              }
            />
          </Card>
        }
      >
        {(roles) => (
          <div className="space-y-2">
            {roles.map((r) => (
              <Card key={r.id}>
                <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base text-ink-900 dark:text-white">{r.title}</h3>
                    <div className="text-xs text-ink-500 dark:text-gray-400 mt-0.5">{r.hm_name}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Async>
    </section>
  )
}

const OpenRolesSection = memo(OpenRolesSectionImpl)
export default OpenRolesSection
