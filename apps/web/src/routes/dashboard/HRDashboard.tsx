import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { useSeo } from '../../lib/useSeo'
import Skeleton from '../../components/Skeleton'
import { Button, Alert, PageHeader, Stat } from '../../components/ui'
import LinkHMPanel from './admin/LinkHMPanel'
import { useHrDashboardData } from './hr/useHrDashboardData'
import HiringManagersSection from './hr/HiringManagersSection'
import OpenRolesSection from './hr/OpenRolesSection'
import SchedulingSection from './hr/SchedulingSection'
import AddMeAsHmModal from './hr/AddMeAsHmModal'
import type { HRTab } from './hr/types'

export default function HRDashboard() {
  const { t } = useTranslation()
  useSeo({ title: t('hrDash.seoTitle'), noindex: true })
  const navigate = useNavigate()
  const [hrTab, setHrTab] = useState<HRTab>('scheduling')

  const {
    pending,
    scheduled,
    outcomesPending,
    hms,
    openRoles,
    loading,
    err,
    setErr,
    setLoadRetry,
    schedulingId,
    setSchedulingId,
    scheduledAt,
    setScheduledAt,
    format,
    setFormat,
    addMeOpen,
    setAddMeOpen,
    addMeJobTitle,
    setAddMeJobTitle,
    addMeBusy,
    addMeErr,
    setAddMeErr,
    justSelfRegistered,
    completeInterview,
    scheduleInterview,
    createMeetingLink,
    submitAddMe,
  } = useHrDashboardData()

  // The blocking spinner is gone — the shell always renders. The only
  // remaining "block-everything" state is the explicit timeout-error retry,
  // shown when the load watchdog fires AND we still have no cached snapshot.
  if (loading && err && hms == null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-fg-muted">{err}</p>
        <Button onClick={() => { setErr(null); setLoadRetry((r) => r + 1) }}>{t('hrDash.retry')}</Button>
      </div>
    )
  }

  const isSelfHM = (hms ?? []).some((h) => h.is_self)

  return (
    <div>
      <PageHeader
        title={t('hrDash.pageTitle')}
        description={t('hrDash.pageDescription')}
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto">
        {(['scheduling', 'link-hms'] as HRTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setHrTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              hrTab === tab
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-fg-muted hover:text-ink-800 dark:hover:text-fg'
            }`}
          >
            {tab === 'scheduling' ? t('hrDash.tabScheduling') : t('hrDash.tabLinkHms')}
          </button>
        ))}
      </div>

      {hrTab === 'link-hms' && <LinkHMPanel />}
      {hrTab === 'scheduling' && (<>

      {justSelfRegistered && (
        <div className="mb-6">
          <Alert tone="green">
            <Trans
              i18nKey="hrDash.selfHmBanner"
              components={{
                profileLink: <Link to="/onboarding/hm" className="underline font-medium" />,
                postRoleLink: <Link to="/hm/post-role" className="underline font-medium" />,
              }}
            />
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <Stat
          label={t('hrDash.statToSchedule')}
          value={pending == null ? <Skeleton width={40} height={28} /> : pending.length}
          tone={(pending?.length ?? 0) > 0 ? 'brand' : 'default'}
        />
        <Stat
          label={t('hrDash.statUpcoming')}
          value={scheduled == null ? <Skeleton width={40} height={28} /> : scheduled.length}
        />
        <Stat
          label={t('hrDash.statOutcomesPending')}
          value={outcomesPending == null ? <Skeleton width={40} height={28} /> : outcomesPending}
          hint={(outcomesPending ?? 0) > 0 ? t('hrDash.statAwaitingFeedback') : undefined}
          tone={(outcomesPending ?? 0) > 0 ? 'brand' : 'default'}
        />
      </div>

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}

      {/* Your hiring managers */}
      <HiringManagersSection
        hms={hms}
        isSelfHM={isSelfHM}
        onSwitchToHmView={() => navigate('/hm')}
        onAddMe={() => { setAddMeErr(null); setAddMeOpen(true) }}
      />

      {/* Open roles */}
      <OpenRolesSection openRoles={openRoles} hms={hms} />

      {/* Scheduling (existing logic) */}
      <SchedulingSection
        pending={pending}
        scheduled={scheduled}
        schedulingId={schedulingId}
        scheduledAt={scheduledAt}
        format={format}
        onSetScheduledAt={setScheduledAt}
        onSetFormat={setFormat}
        onStartScheduling={(id) => setSchedulingId(id)}
        onCancelScheduling={() => { setSchedulingId(null); setScheduledAt('') }}
        onConfirmSchedule={(id) => void scheduleInterview(id)}
        onCreateMeetingLink={(id) => void createMeetingLink(id)}
        onCompleteInterview={(iid, mid, hired) => void completeInterview(iid, mid, hired)}
      />
      </>)}

      {addMeOpen && (
        <AddMeAsHmModal
          jobTitle={addMeJobTitle}
          busy={addMeBusy}
          err={addMeErr}
          onJobTitleChange={setAddMeJobTitle}
          onClose={() => setAddMeOpen(false)}
          onSubmit={submitAddMe}
        />
      )}
    </div>
  )
}
