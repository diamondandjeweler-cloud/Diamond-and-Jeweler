import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { useSeo } from '../../lib/useSeo'
import { readDashCache, writeDashCache } from '../../lib/dashboardCache'
import Skeleton from '../../components/Skeleton'
import { Button, Card, Badge, Alert, EmptyState, PageHeader, Stat, Input, Select } from '../../components/ui'
import LinkHMPanel from './admin/LinkHMPanel'

/** Snapshot of structural data that's safe to cache cross-session. Excludes
 *  candidate-level identifiers and match scores (PDPA-sensitive). */
interface HRCacheSnapshot {
  companyId: string | null
  outcomesPending: number
  hms: HMRow[]
  openRoles: OpenRoleRow[]
}

interface PendingRow {
  id: string
  status: string
  compatibility_score: number | null
  roles: { id: string; title: string } | null
  talents: { id: string; profile_id: string } | null
}

interface ScheduledRow {
  match_id: string
  interview_id: string
  status: string
  scheduled_at: string | null
  format: string | null
  role_title: string
  talent_id: string
  meeting_url: string | null
  meeting_provider: string | null
}

interface HMRow {
  id: string
  profile_id: string
  full_name: string
  job_title: string
  role_count: number
  is_self: boolean
}

interface OpenRoleRow {
  id: string
  title: string
  hm_name: string
}

type HRTab = 'scheduling' | 'link-hms'

export default function HRDashboard() {
  const { t } = useTranslation()
  useSeo({ title: t('hrDash.seoTitle'), noindex: true })
  const navigate = useNavigate()
  const { session, refreshIsHM } = useSession()
  const userId = session?.user.id
  const userEmail = session?.user.email ?? null
  const [hrTab, setHrTab] = useState<HRTab>('scheduling')
  // Hydrate from localStorage so returning users see their last-known KPI
  // numbers + lists instantly. `null` = "still loading from network, show
  // skeleton". A loaded-but-empty array shows the EmptyState card.
  const cached = useState(() => readDashCache<HRCacheSnapshot>('hr_dashboard', userId))[0]
  const [pending, setPending] = useState<PendingRow[] | null>(null)
  const [scheduled, setScheduled] = useState<ScheduledRow[] | null>(null)
  const [outcomesPending, setOutcomesPending] = useState<number | null>(cached?.outcomesPending ?? null)
  const [hms, setHms] = useState<HMRow[] | null>(cached?.hms ?? null)
  const [openRoles, setOpenRoles] = useState<OpenRoleRow[] | null>(cached?.openRoles ?? null)
  const [companyId, setCompanyId] = useState<string | null>(cached?.companyId ?? null)
  // `loading` now only controls the error-banner timeout — never the shell
  // render. The shell always paints; individual sections skeleton themselves.
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [loadRetry, setLoadRetry] = useState(0)
  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [format, setFormat] = useState<'video' | 'phone' | 'in_person'>('video')

  // Add-me-as-HM modal state
  const [addMeOpen, setAddMeOpen] = useState(false)
  const [addMeJobTitle, setAddMeJobTitle] = useState('')
  const [addMeBusy, setAddMeBusy] = useState(false)
  const [addMeErr, setAddMeErr] = useState<string | null>(null)
  const [justSelfRegistered, setJustSelfRegistered] = useState(false)

  useEffect(() => {
    let cancelled = false
    setErr(null)
    // Timeout: keep loading=true so the empty-data state never renders.
    // The retry UI (below) replaces the spinner when this fires.
    const loadTimeout = setTimeout(() => {
      if (!cancelled) setErr(t('hrDash.errTimeout'))
    }, 20000)
    async function load() {
      if (!userId || !userEmail) { clearTimeout(loadTimeout); setLoading(false); return }
      try {
      // Warm the auth token first. If the access token is expired, this call
      // completes the refresh before the DB queries start — otherwise all
      // queries queue silently behind the refresh and appear to hang.
      await supabase.auth.getSession()
      if (cancelled) { clearTimeout(loadTimeout); return }
      const { data: comp } = await supabase.from('companies').select('id').eq('primary_hr_email', userEmail).maybeSingle()
      if (!comp) {
        // No company row yet — surface empty lists (not skeletons) so the
        // EmptyState UI takes over instead of permanent shimmer.
        setHms([]); setOpenRoles([]); setPending([]); setScheduled([])
        setOutcomesPending(0)
        setLoading(false)
        return
      }
      setCompanyId(comp.id)

      // §1 — All hiring managers in the company, with their profile names.
      const { data: hmRows } = await supabase
        .from('hiring_managers')
        .select('id, profile_id, job_title, profiles!inner(full_name)')
        .eq('company_id', comp.id)
      const hmIds = (hmRows ?? []).map((h) => h.id)

      if (hmIds.length === 0) {
        const hmsMappedEmpty: HMRow[] = ((hmRows ?? []) as unknown as Array<{
          id: string; profile_id: string; job_title: string; profiles: { full_name: string } | null
        }>).map((h) => ({
          id: h.id,
          profile_id: h.profile_id,
          full_name: h.profiles?.full_name ?? '(unknown)',
          job_title: h.job_title,
          role_count: 0,
          is_self: h.profile_id === userId,
        }))
        if (!cancelled) {
          setHms(hmsMappedEmpty)
          // No HMs means no roles, no matches, no interviews. Materialise
          // those as empty arrays so their sections render EmptyState
          // instead of staying on skeleton.
          setOpenRoles([])
          setPending([])
          setScheduled([])
          setOutcomesPending(0)
          writeDashCache<HRCacheSnapshot>('hr_dashboard', userId, {
            companyId: comp.id, outcomesPending: 0,
            hms: hmsMappedEmpty, openRoles: [],
          })
          setLoading(false)
        }
        return
      }

      // §2 — One query for roles (id, title, hm_id) covers BOTH per-HM role
      // counts AND the open-roles list. Previously we ran two near-identical
      // queries sequentially.
      const { data: rolesData } = await supabase
        .from('roles')
        .select('id, title, hiring_manager_id')
        .in('hiring_manager_id', hmIds)
        .order('created_at', { ascending: false })

      const roleCountMap = new Map<string, number>()
      for (const r of (rolesData ?? []) as Array<{ id: string; hiring_manager_id: string }>) {
        roleCountMap.set(r.hiring_manager_id, (roleCountMap.get(r.hiring_manager_id) ?? 0) + 1)
      }

      const hmsMapped: HMRow[] = ((hmRows ?? []) as unknown as Array<{
        id: string; profile_id: string; job_title: string; profiles: { full_name: string } | null
      }>).map((h) => ({
        id: h.id,
        profile_id: h.profile_id,
        full_name: h.profiles?.full_name ?? '(unknown)',
        job_title: h.job_title,
        role_count: roleCountMap.get(h.id) ?? 0,
        is_self: h.profile_id === userId,
      }))
      if (!cancelled) setHms(hmsMapped)
      const hmNameMap = new Map(hmsMapped.map((h) => [h.id, h.full_name]))
      const openRolesMapped: OpenRoleRow[] = ((rolesData ?? []) as Array<{
        id: string; title: string; hiring_manager_id: string
      }>).map((r) => ({
        id: r.id, title: r.title, hm_name: hmNameMap.get(r.hiring_manager_id) ?? '—',
      }))
      if (!cancelled) setOpenRoles(openRolesMapped)

      const roleIds = (rolesData ?? []).map((r) => r.id)
      if (roleIds.length === 0) {
        // HMs exist but no roles posted yet — empty the data slots so the
        // KPI numbers settle on 0 and the lists show EmptyState.
        setPending([]); setScheduled([]); setOutcomesPending(0)
        writeDashCache<HRCacheSnapshot>('hr_dashboard', userId, {
          companyId: comp.id, outcomesPending: 0, hms: hmsMapped, openRoles: openRolesMapped,
        })
        setLoading(false); return
      }

      const [{ data: pendingData, error: pendErr }, { data: scheduledData }, { data: completedMatches }] = await Promise.all([
        supabase.from('matches')
          .select('id, status, compatibility_score, roles(id, title), talents(id, profile_id)')
          .in('role_id', roleIds).in('status', ['invited_by_manager', 'hr_scheduling'])
          .order('invited_at', { ascending: true }),
        supabase.from('interviews')
          .select('id, scheduled_at, format, status, match_id, meeting_url, meeting_provider, matches!inner(role_id, talent_id, roles(title))')
          .in('matches.role_id', roleIds).in('status', ['scheduled', 'confirmed'])
          .order('scheduled_at', { ascending: true }),
        // Outcomes pending: interviews finished but no feedback row yet from
        // either side. Counted at the matches level (not interviews) so a
        // re-scheduled interview doesn't double-count.
        supabase.from('matches')
          .select('id, match_feedback(id)')
          .in('role_id', roleIds)
          .in('status', ['interview_completed', 'hired']),
      ])
      if (cancelled) return
      if (pendErr) setErr(pendErr.message)
      else setPending((pendingData ?? []) as unknown as PendingRow[])

      const mapped: ScheduledRow[] = ((scheduledData ?? []) as unknown as Array<{
        id: string; scheduled_at: string | null; format: string | null; status: string; match_id: string
        meeting_url: string | null; meeting_provider: string | null
        matches: { talent_id: string; roles: { title: string } | null } | null
      }>).map((s) => ({
        interview_id: s.id, match_id: s.match_id, status: s.status,
        scheduled_at: s.scheduled_at, format: s.format,
        role_title: s.matches?.roles?.title ?? '(role gone)',
        talent_id: s.matches?.talent_id ?? '',
        meeting_url: s.meeting_url,
        meeting_provider: s.meeting_provider,
      }))
      setScheduled(mapped)

      const pendingOutcomes = ((completedMatches ?? []) as unknown as Array<{
        id: string; match_feedback: { id: string }[] | null
      }>).filter((m) => !m.match_feedback || m.match_feedback.length === 0).length
      setOutcomesPending(pendingOutcomes)

      // Persist a snapshot for instant render on the next visit. Only the
      // safe, structural fields — never the candidate-level matches arrays.
      writeDashCache<HRCacheSnapshot>('hr_dashboard', userId, {
        companyId: comp.id,
        outcomesPending: pendingOutcomes,
        hms: hmsMapped,
        openRoles: openRolesMapped,
      })

      clearTimeout(loadTimeout)
      setLoading(false)
      } catch (e) {
        clearTimeout(loadTimeout)
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Load failed')
          // Settle any still-null data slots so skeletons resolve and the
          // user sees the error banner against the empty-state UI.
          setHms((cur) => cur ?? [])
          setOpenRoles((cur) => cur ?? [])
          setPending((cur) => cur ?? [])
          setScheduled((cur) => cur ?? [])
          setOutcomesPending((cur) => cur ?? 0)
          setLoading(false)
        }
      }
    }
    void load()
    return () => { cancelled = true; clearTimeout(loadTimeout) }
  }, [userId, userEmail, loadRetry, t])

  async function completeInterview(interviewId: string, matchId: string, hired: boolean) {
    const { error: iErr } = await supabase.from('interviews').update({ status: 'completed' }).eq('id', interviewId)
    if (iErr) { setErr(iErr.message); return }
    const { error: mErr } = await supabase.from('matches')
      .update({ status: hired ? 'hired' : 'interview_completed', updated_at: new Date().toISOString() })
      .eq('id', matchId)
    if (mErr) { setErr(mErr.message); return }
    setScheduled((xs) => (xs ?? []).filter((s) => s.interview_id !== interviewId))
  }

  async function scheduleInterview(matchId: string) {
    if (!scheduledAt) { setErr(t('hrDash.errPickDateTime')); return }
    const { error: iErr } = await supabase.from('interviews').insert({
      match_id: matchId, scheduled_at: new Date(scheduledAt).toISOString(),
      format, status: 'scheduled',
    })
    if (iErr) { setErr(iErr.message); return }
    const { error: mErr } = await supabase.from('matches').update({ status: 'interview_scheduled' }).eq('id', matchId)
    if (mErr) { setErr(mErr.message); return }
    setPending((rs) => (rs ?? []).filter((r) => r.id !== matchId))
    setSchedulingId(null); setScheduledAt('')
  }

  async function submitAddMe(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !companyId) return
    setAddMeBusy(true); setAddMeErr(null)
    try {
      const { error } = await supabase.from('hiring_managers').insert({
        profile_id: session.user.id,
        company_id: companyId,
        job_title: addMeJobTitle.trim(),
      })
      if (error) throw error
      // Refresh both the page-local HM list and the global isHM flag (drives
      // sidebar HM links + RoleGate access to /hm routes).
      await refreshIsHM()
      const { data: comp } = await supabase.from('companies').select('id').eq('id', companyId).maybeSingle()
      if (comp) {
        const { data: hmRows } = await supabase
          .from('hiring_managers')
          .select('id, profile_id, job_title, profiles!inner(full_name)')
          .eq('company_id', companyId)
        const userId = session.user.id
        const newHms: HMRow[] = ((hmRows ?? []) as unknown as Array<{
          id: string; profile_id: string; job_title: string; profiles: { full_name: string } | null
        }>).map((h) => ({
          id: h.id, profile_id: h.profile_id,
          full_name: h.profiles?.full_name ?? '(unknown)',
          job_title: h.job_title, role_count: 0,
          is_self: h.profile_id === userId,
        }))
        setHms(newHms)
      }
      setAddMeOpen(false)
      setAddMeJobTitle('')
      setJustSelfRegistered(true)
    } catch (e2) {
      setAddMeErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setAddMeBusy(false)
    }
  }

  // The blocking spinner is gone — the shell always renders. The only
  // remaining "block-everything" state is the explicit timeout-error retry,
  // shown when the load watchdog fires AND we still have no cached snapshot.
  if (loading && err && hms == null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-ink-500">{err}</p>
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
      <div className="flex gap-1 border-b border-ink-200 mb-8 overflow-x-auto">
        {(['scheduling', 'link-hms'] as HRTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setHrTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              hrTab === tab
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-800'
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
                      <Button size="sm" variant="secondary" onClick={() => navigate('/hm')}>
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
              onClick={() => { setAddMeErr(null); setAddMeOpen(true) }}
            >
              {t('hrDash.addMeAsHm')}
            </button>
          </div>
        )}
      </section>

      {/* Open roles */}
      <section className="mb-10">
        <SectionHeader
          title={t('hrDash.openRolesTitle')}
          subtitle={t('hrDash.openRolesSubtitle')}
          count={openRoles?.length}
        />
        {openRoles == null ? (
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
        ) : openRoles.length === 0 ? (
          <Card>
            <EmptyState
              title={t('hrDash.openRolesEmptyTitle')}
              description={(hms?.length ?? 0) === 0
                ? t('hrDash.openRolesEmptyNoHm')
                : t('hrDash.openRolesEmptyNoRoles')}
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {openRoles.map((r) => (
              <Card key={r.id}>
                <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base text-ink-900">{r.title}</h3>
                    <div className="text-xs text-ink-500 mt-0.5">{r.hm_name}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Scheduling (existing logic) */}
      <section>
        <SectionHeader
          title={t('hrDash.scheduleInterviewsTitle')}
          subtitle={t('hrDash.scheduleInterviewsSubtitle')}
          count={(pending?.length ?? 0) + (scheduled?.length ?? 0)}
        />

      {(scheduled?.length ?? 0) > 0 && (
        <section className="mb-8">
          <SubHeader title={t('hrDash.upcomingInterviews')} count={scheduled!.length} />
          <div className="space-y-3">
            {scheduled!.map((s) => (
              <Card key={s.interview_id}>
                <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg text-ink-900">{s.role_title}</h3>
                    <div className="text-xs text-ink-500 mt-0.5">
                      {t('hrDash.candidate')} ·{' '}
                      {s.scheduled_at
                        ? new Date(s.scheduled_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })
                        : '—'}
                      {' · '}
                      <span>{s.format ? t(`hrDash.format.${s.format}`, { defaultValue: s.format }) : '—'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    {s.meeting_url ? (
                      <a href={s.meeting_url} target="_blank" rel="noopener noreferrer" className="btn-brand btn-sm">
                        {t('hrDash.joinMeeting')}{s.meeting_provider ? ` · ${s.meeting_provider}` : ''}
                      </a>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={async () => {
                        try {
                          const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? ''
                          const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-meeting`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                            body: JSON.stringify({ interview_id: s.interview_id }),
                          })
                          const j = await r.json() as { meeting_url?: string; provider?: string; error?: string }
                          if (!r.ok) throw new Error(j.error || 'Failed')
                          setScheduled((xs) => (xs ?? []).map((x) => x.interview_id === s.interview_id ? { ...x, meeting_url: j.meeting_url ?? null, meeting_provider: j.provider ?? null } : x))
                        } catch (e) {
                          setErr((e as Error).message)
                        }
                      }}>{t('hrDash.createMeetingLink')}</Button>
                    )}
                    <Button size="sm" onClick={() => void completeInterview(s.interview_id, s.match_id, true)}>{t('hrDash.markHired')}</Button>
                    <Button size="sm" variant="secondary" onClick={() => void completeInterview(s.interview_id, s.match_id, false)}>{t('hrDash.notHired')}</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <SubHeader title={t('hrDash.awaitingScheduling')} count={pending?.length ?? 0} />
        {pending == null ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Card key={i}>
                <div className="p-5 flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton width={220} height={18} />
                    <Skeleton width={140} height={11} rounded="sm" />
                  </div>
                  <Skeleton width={140} height={32} />
                </div>
              </Card>
            ))}
          </div>
        ) : pending.length === 0 ? (
          <Card>
            <EmptyState
              title={t('hrDash.nothingToSchedule')}
              description={t('hrDash.nothingToScheduleDesc')}
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <Card key={p.id}>
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg text-ink-900">{p.roles?.title}</h3>
                      <div className="text-xs text-ink-500 mt-0.5 flex items-center gap-2">
                        <span>{t('hrDash.candidate')}</span>
                        <Badge tone="green">{t('hrDash.percentMatch', { pct: Math.round(p.compatibility_score ?? 0) })}</Badge>
                      </div>
                    </div>
                    {schedulingId !== p.id && (
                      <Button size="sm" onClick={() => setSchedulingId(p.id)}>{t('hrDash.scheduleInterview')}</Button>
                    )}
                  </div>
                  {schedulingId === p.id && (
                    <div className="mt-5 grid md:grid-cols-3 gap-3 pt-5 border-t border-ink-100">
                      <Input label={t('hrDash.dateTimeLabel')} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                      <Select label={t('hrDash.formatLabel')} value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
                        <option value="video">{t('hrDash.format.video')}</option>
                        <option value="phone">{t('hrDash.format.phone')}</option>
                        <option value="in_person">{t('hrDash.format.in_person')}</option>
                      </Select>
                      <div className="flex items-end gap-2">
                        <Button onClick={() => void scheduleInterview(p.id)} className="flex-1">{t('hrDash.confirm')}</Button>
                        <Button variant="secondary" onClick={() => { setSchedulingId(null); setScheduledAt('') }}>{t('common.cancel')}</Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      </section>
      </>)}

      {addMeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-me-hm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 id="add-me-hm-title" className="text-xl font-semibold text-ink-900">
              {t('hrDash.addMeModalTitle')}
            </h2>
            <p className="text-sm text-ink-700">
              {t('hrDash.addMeModalBody')}
            </p>
            <form onSubmit={submitAddMe} className="space-y-4">
              <Input
                label={t('hrDash.jobTitleLabel')}
                value={addMeJobTitle}
                onChange={(e) => setAddMeJobTitle(e.target.value)}
                placeholder={t('hrDash.jobTitlePlaceholder')}
                required
                // Modal opens with this as the only field; focusing it is the expected behaviour.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              {addMeErr && <Alert tone="red">{addMeErr}</Alert>}
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="secondary" onClick={() => setAddMeOpen(false)} disabled={addMeBusy}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={addMeBusy} disabled={!addMeJobTitle.trim()}>
                  {t('hrDash.addMeButton')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionHeader({
  title, subtitle, count, action,
}: {
  title: string
  subtitle?: string
  count?: number
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-xl text-ink-900">{title}</h2>
          {typeof count === 'number' && <span className="text-sm text-ink-400">{count}</span>}
        </div>
        {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

function SubHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 mb-4 mt-2">
      <h3 className="font-display text-lg text-ink-800">{title}</h3>
      <span className="text-sm text-ink-400">{count}</span>
    </div>
  )
}
