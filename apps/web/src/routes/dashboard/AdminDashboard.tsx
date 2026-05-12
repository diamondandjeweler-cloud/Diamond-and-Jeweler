import { useState } from 'react'
import TabButton from './admin/TabButton'
import KpiPanel from './admin/KpiPanel'
import VerificationQueue from './admin/VerificationQueue'
import WaitlistPanel from './admin/WaitlistPanel'
import ColdStartPanel from './admin/ColdStartPanel'
import UserPanel from './admin/UserPanel'
import MatchPanel from './admin/MatchPanel'
import MatchApprovalPanel from './admin/MatchApprovalPanel'
import ModerationPanel from './admin/ModerationPanel'
import MonthlyBoostPanel from './admin/MonthlyBoostPanel'
import TagPanel from './admin/TagPanel'
import DsrPanel from './admin/DsrPanel'
import MarketRatePanel from './admin/MarketRatePanel'
import NotificationLogPanel from './admin/NotificationLogPanel'
import SystemConfigPanel from './admin/SystemConfigPanel'
import PricingPanel from './admin/PricingPanel'
import SupportPanel from './admin/SupportPanel'
import AIChatPanel from './admin/AIChatPanel'
import AuditLogPanel from './admin/AuditLogPanel'
import DevSeedPanel from './admin/DevSeedPanel'
import { PageHeader } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'
import { useSession } from '../../state/useSession'

type AdminTab =
  | 'kpi' | 'companies' | 'waitlist' | 'coldstart' | 'users' | 'approvals' | 'moderation' | 'matches'
  | 'monthly_boost' | 'tags' | 'dsr' | 'market' | 'notifications' | 'pricing' | 'config'
  | 'support' | 'ai_chats' | 'audit' | 'dev_seed'

const TABS: Array<{ key: AdminTab; label: string; render: () => JSX.Element; testOnly?: boolean }> = [
  { key: 'kpi',           label: 'Overview',      render: () => <KpiPanel /> },
  { key: 'companies',     label: 'Verification',  render: () => <VerificationQueue /> },
  { key: 'waitlist',      label: 'Waitlist',      render: () => <WaitlistPanel /> },
  { key: 'coldstart',     label: 'Cold start',    render: () => <ColdStartPanel /> },
  { key: 'users',         label: 'Users',         render: () => <UserPanel /> },
  { key: 'approvals',     label: 'Approvals',     render: () => <MatchApprovalPanel /> },
  { key: 'moderation',    label: 'Job moderation', render: () => <ModerationPanel /> },
  { key: 'monthly_boost', label: 'Monthly boost', render: () => <MonthlyBoostPanel /> },
  { key: 'matches',       label: 'Matches',       render: () => <MatchPanel /> },
  { key: 'tags',          label: 'Tags',          render: () => <TagPanel /> },
  { key: 'dsr',           label: 'Data requests', render: () => <DsrPanel /> },
  { key: 'audit',         label: 'Audit log',     render: () => <AuditLogPanel /> },
  { key: 'market',        label: 'Market rates',  render: () => <MarketRatePanel /> },
  { key: 'notifications', label: 'Notifications', render: () => <NotificationLogPanel /> },
  { key: 'pricing',       label: 'Pricing',       render: () => <PricingPanel /> },
  { key: 'config',        label: 'Config (raw)',  render: () => <SystemConfigPanel /> },
  { key: 'support',       label: 'Support',       render: () => <SupportPanel /> },
  { key: 'ai_chats',      label: 'AI chats',      render: () => <AIChatPanel /> },
  { key: 'dev_seed',      label: 'Dev seed',      render: () => <DevSeedPanel />, testOnly: true },
]

export default function AdminDashboard() {
  useSeo({ title: 'Admin console', noindex: true })
  const { profile } = useSession()
  const isTestEnv = import.meta.env.DEV ||
    (profile?.email?.toLowerCase().endsWith('@dnj-test.my') ?? false)
  const visibleTabs = TABS.filter((t) => !t.testOnly || isTestEnv)
  const [tab, setTab] = useState<AdminTab>('kpi')
  const active = visibleTabs.find((t) => t.key === tab) ?? visibleTabs[0]

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
        {visibleTabs.map((t) => (
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
