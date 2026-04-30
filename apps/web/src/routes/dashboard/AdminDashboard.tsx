import { useState } from 'react'
import TabButton from './admin/TabButton'
import KpiPanel from './admin/KpiPanel'
import VerificationQueue from './admin/VerificationQueue'
import WaitlistPanel from './admin/WaitlistPanel'
import ColdStartPanel from './admin/ColdStartPanel'
import UserPanel from './admin/UserPanel'
import MatchPanel from './admin/MatchPanel'
import TagPanel from './admin/TagPanel'
import DsrPanel from './admin/DsrPanel'
import MarketRatePanel from './admin/MarketRatePanel'
import NotificationLogPanel from './admin/NotificationLogPanel'
import SystemConfigPanel from './admin/SystemConfigPanel'
import PricingPanel from './admin/PricingPanel'
import SupportPanel from './admin/SupportPanel'
import { PageHeader } from '../../components/ui'

type AdminTab =
  | 'kpi' | 'companies' | 'waitlist' | 'coldstart' | 'users' | 'matches'
  | 'tags' | 'dsr' | 'market' | 'notifications' | 'pricing' | 'support' | 'config'

const TABS: Array<{ key: AdminTab; label: string; render: () => JSX.Element }> = [
  { key: 'kpi',           label: 'Overview',      render: () => <KpiPanel /> },
  { key: 'companies',     label: 'Verification',  render: () => <VerificationQueue /> },
  { key: 'waitlist',      label: 'Waitlist',      render: () => <WaitlistPanel /> },
  { key: 'coldstart',     label: 'Cold start',    render: () => <ColdStartPanel /> },
  { key: 'users',         label: 'Users',         render: () => <UserPanel /> },
  { key: 'matches',       label: 'Matches',       render: () => <MatchPanel /> },
  { key: 'tags',          label: 'Tags',          render: () => <TagPanel /> },
  { key: 'dsr',           label: 'Data requests', render: () => <DsrPanel /> },
  { key: 'market',        label: 'Market rates',  render: () => <MarketRatePanel /> },
  { key: 'notifications', label: 'Notifications', render: () => <NotificationLogPanel /> },
  { key: 'pricing',       label: 'Pricing',       render: () => <PricingPanel /> },
  { key: 'support',       label: 'Support',       render: () => <SupportPanel /> },
  { key: 'config',        label: 'Config (raw)',  render: () => <SystemConfigPanel /> },
]

export default function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>('kpi')
  const active = TABS.find((t) => t.key === tab) ?? TABS[0]

  return (
    <div>
      <PageHeader
        eyebrow="Platform admin"
        title="Admin console"
        description="Operate the platform — verify companies, run the cold-start queue, manage tags, audit matches, respond to DSRs."
      />

      <div
        className="flex gap-1 border-b border-ink-200 mb-8 overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0"
        role="tablist"
        aria-label="Admin sections"
      >
        {TABS.map((t) => (
          <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </TabButton>
        ))}
      </div>

      <section role="tabpanel" aria-label={active.label} className="animate-fade-in">
        {active.render()}
      </section>
    </div>
  )
}
