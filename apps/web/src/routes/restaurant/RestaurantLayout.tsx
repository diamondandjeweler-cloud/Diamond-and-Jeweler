import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RestaurantProvider, useRestaurant } from '../../lib/restaurant/context'
import { Alert, Badge, PageHeader, Spinner } from '../../components/ui'
import { useSession } from '../../state/useSession'
import OrgSetup from './OrgSetup'
import type { EmployeeRole } from '../../lib/restaurant/types'

const TAB_KEYS: Array<{ to: string; key: string }> = [
  { to: '/restaurant',            key: 'overview' },
  { to: '/restaurant/kiosk',      key: 'kiosk' },
  { to: '/restaurant/floor',      key: 'floor' },
  { to: '/restaurant/orders',     key: 'orders' },
  { to: '/restaurant/kds',        key: 'kitchen' },
  { to: '/restaurant/bar',        key: 'bar' },
  { to: '/restaurant/cashier',    key: 'cashier' },
  { to: '/restaurant/shifts',     key: 'shifts' },
  { to: '/restaurant/inventory',  key: 'inventory' },
  { to: '/restaurant/purchasing', key: 'purchasing' },
  { to: '/restaurant/staff',      key: 'staff' },
  { to: '/restaurant/accounting', key: 'accounting' },
  { to: '/restaurant/promotions', key: 'promotions' },
  { to: '/restaurant/audit',      key: 'audit' },
  { to: '/restaurant/branches',   key: 'branches' },
  { to: '/restaurant/reports',    key: 'reports' },
  { to: '/restaurant/admin',      key: 'admin' },
]

const ALL_TABS = TAB_KEYS.map((t) => t.key)

const ROLE_TABS: Record<EmployeeRole, string[]> = {
  waiter:        ['overview', 'kiosk', 'floor', 'orders'],
  kitchen:       ['overview', 'kitchen'],
  bar:           ['overview', 'bar'],
  cashier:       ['overview', 'cashier', 'orders'],
  host:          ['overview', 'floor'],
  storekeeper:   ['overview', 'inventory', 'purchasing'],
  shift_manager: ['overview', 'kiosk', 'floor', 'orders', 'kitchen', 'bar',
                  'cashier', 'shifts', 'inventory', 'purchasing', 'staff', 'promotions', 'reports'],
  admin:         ALL_TABS,
  owner:         ALL_TABS,
}

export default function RestaurantLayout() {
  return (
    <RestaurantProvider>
      <Inner />
    </RestaurantProvider>
  )
}

function Inner() {
  const { loading, branches, branch, branchId, setBranchId, employee, setEmployeeId, error, noOrg, isOrgOwner, org } = useRestaurant()
  const { profile } = useSession()
  const { pathname } = useLocation()
  const { t } = useTranslation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  if (loading) {
    return (
      <div className="py-20 text-center text-ink-500">
        <div className="inline-flex items-center gap-2"><Spinner /> Loading restaurant…</div>
      </div>
    )
  }

  // First-time setup: user has no org membership yet
  if (noOrg) {
    return <OrgSetup />
  }

  // Determine which tabs this user/employee may see
  const isPlatformAdmin = profile?.role === 'admin'
  const allowedKeys: string[] = (() => {
    if (isPlatformAdmin || isOrgOwner) return ALL_TABS
    if (employee) return ROLE_TABS[employee.role] ?? ['overview']
    return ['overview']
  })()

  const visibleTabs = TAB_KEYS.filter((tab) => allowedKeys.includes(tab.key))

  return (
    <div>
      <div className="surface-brand rounded-2xl border border-ink-200/60 px-6 md:px-8 py-7 md:py-8 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-50 pointer-events-none" aria-hidden />
        <PageHeader
          eyebrow={org ? `Restaurant OS · ${org.name}` : 'Restaurant OS'}
          title={
            <span className="flex items-center gap-3">
              {t('restaurant.title')}
              <Badge tone="amber" dot>{t('restaurant.devBadge')}</Badge>
            </span>
          }
          description="Restaurant Operating System — multi-branch, multi-tenant."
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  className="text-sm pl-9 pr-3 py-2 min-w-[180px] bg-white border-ink-200 rounded-lg shadow-soft"
                  value={branchId ?? ''}
                  onChange={(e) => setBranchId(e.target.value)}
                  aria-label="Branch"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13z" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              {employee ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setEmployeeId(null)}
                  title="Sign out of employee session"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {employee.name} · {employee.role}
                </button>
              ) : (
                <span className="text-xs text-ink-500 px-3 py-2 rounded-md bg-white/60 border border-ink-200">No staff PIN</span>
              )}
            </div>
          }
        />
      </div>

      {error && (
        <div className="mb-4">
          <Alert tone="red" title="Backend error">
            {error}
            <button
              type="button"
              className="ml-3 underline text-sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </Alert>
        </div>
      )}
      {!branch && (
        <div className="mb-4">
          <Alert tone="amber">No branch selected yet.</Alert>
        </div>
      )}

      <nav
        className="tabstrip mb-6 sticky top-16 z-30 bg-ink-50/85 backdrop-blur"
        aria-label="Restaurant sections"
      >
        {visibleTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/restaurant'}
            className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
          >
            {t(`restaurant.tabs.${tab.key}`)}
          </NavLink>
        ))}
      </nav>

      <section className="animate-fade-in">
        <Outlet />
      </section>
    </div>
  )
}
