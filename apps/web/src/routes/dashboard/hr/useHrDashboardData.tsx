import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '../../../lib/supabase'
import { companyIdByHrEmail, companyIdById } from '../../../data/repositories/companies'
import { hmsWithNamesByCompanyId, insertHm } from '../../../data/repositories/hiringManagers'
import { listRolesForHms } from '../../../data/repositories/roles'
import { hrPendingMatches, hrOutcomesPendingMatches, updateMatch } from '../../../data/repositories/matches'
import { updateInterview, insertInterview, hrScheduledInterviewsForRoles } from '../../../data/repositories/interviews'
import { writeDashCache } from '../../../lib/dashboardCache'
import { useDashCacheSnapshot } from '../useDashboardResource'
import type {
  HRCacheSnapshot, PendingRow, ScheduledRow, HMRow, OpenRoleRow,
} from './types'

/**
 * Owns the HR dashboard's data-loading + derived-state orchestration: the
 * multi-phase scheduling/matches load, the timeout watchdog, the cached KPI
 * snapshot, and every async action handler (schedule / complete / add-me /
 * create-meeting-link). Behaviour is identical to the inline implementation
 * that previously lived in HRDashboard — this is a verbatim relocation, not a
 * redesign. Inline supabase.from/.rpc queries are kept exact.
 */
export function useHrDashboardData() {
  const { t } = useTranslation()
  const { session, refreshIsHM } = useSession(useShallow((s) => ({ session: s.session, refreshIsHM: s.refreshIsHM })))
  const userId = session?.user.id
  const userEmail = session?.user.email ?? null
  // Hydrate from localStorage so returning users see their last-known KPI
  // numbers + lists instantly. `null` = "still loading from network, show
  // skeleton". A loaded-but-empty array shows the EmptyState card.
  const cached = useDashCacheSnapshot<HRCacheSnapshot>('hr_dashboard', userId)
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
      const { data: comp } = await companyIdByHrEmail(userEmail)
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
      const { data: hmRows } = await hmsWithNamesByCompanyId(comp.id)
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
      const { data: rolesData } = await listRolesForHms(hmIds)

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
        hrPendingMatches(roleIds)
          .order('invited_at', { ascending: true }),
        hrScheduledInterviewsForRoles(roleIds),
        // Outcomes pending: interviews finished but no feedback row yet from
        // either side. Counted at the matches level (not interviews) so a
        // re-scheduled interview doesn't double-count.
        hrOutcomesPendingMatches(roleIds),
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
    const { error: iErr } = await updateInterview(interviewId, { status: 'completed' })
    if (iErr) { setErr(iErr.message); return }
    const { error: mErr } = await updateMatch(matchId, { status: hired ? 'hired' : 'interview_completed', updated_at: new Date().toISOString() })
    if (mErr) { setErr(mErr.message); return }
    setScheduled((xs) => (xs ?? []).filter((s) => s.interview_id !== interviewId))
  }

  async function scheduleInterview(matchId: string) {
    if (!scheduledAt) { setErr(t('hrDash.errPickDateTime')); return }
    const { error: iErr } = await insertInterview({
      match_id: matchId, scheduled_at: new Date(scheduledAt).toISOString(),
      format, status: 'scheduled',
    })
    if (iErr) { setErr(iErr.message); return }
    const { error: mErr } = await updateMatch(matchId, { status: 'interview_scheduled' })
    if (mErr) { setErr(mErr.message); return }
    setPending((rs) => (rs ?? []).filter((r) => r.id !== matchId))
    setSchedulingId(null); setScheduledAt('')
  }

  // Relocated verbatim from the "create meeting link" button's inline onClick.
  async function createMeetingLink(interviewId: string) {
    try {
      const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? ''
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ interview_id: interviewId }),
      })
      const j = await r.json() as { meeting_url?: string; provider?: string; error?: string }
      if (!r.ok) throw new Error(j.error || 'Failed')
      setScheduled((xs) => (xs ?? []).map((x) => x.interview_id === interviewId ? { ...x, meeting_url: j.meeting_url ?? null, meeting_provider: j.provider ?? null } : x))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function submitAddMe(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !companyId) return
    setAddMeBusy(true); setAddMeErr(null)
    try {
      const { error } = await insertHm(session.user.id, companyId, addMeJobTitle.trim())
      if (error) throw error
      // Refresh both the page-local HM list and the global isHM flag (drives
      // sidebar HM links + RoleGate access to /hm routes).
      await refreshIsHM()
      const { data: comp } = await companyIdById(companyId)
      if (comp) {
        const { data: hmRows } = await hmsWithNamesByCompanyId(companyId)
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

  return {
    // raw state
    pending,
    scheduled,
    outcomesPending,
    hms,
    openRoles,
    companyId,
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
    // add-me modal state
    addMeOpen,
    setAddMeOpen,
    addMeJobTitle,
    setAddMeJobTitle,
    addMeBusy,
    addMeErr,
    setAddMeErr,
    justSelfRegistered,
    // action handlers
    completeInterview,
    scheduleInterview,
    createMeetingLink,
    submitAddMe,
  }
}
