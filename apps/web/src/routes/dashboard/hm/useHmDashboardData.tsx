import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../../lib/supabase'
import { callFunction } from '../../../lib/functions'
import { formatError } from '../../../lib/errors'
import { readDashCache, writeDashCache } from '../../../lib/dashboardCache'
import { confirmDialog } from '../../../components/Modal'
import type { InterviewRound, InterviewProposal } from '../../../types/db'
import { hmCandidatesForManager, hmCandidateById, updateMatch, hiredMatchCountForRoles, activeMatchRoleIds } from '../../../data/repositories/matches'
import { profilePointsById } from '../../../data/repositories/profiles'
import { hmDashboardRowByProfileId } from '../../../data/repositories/hiring-managers'
import { companyVerifiedById } from '../../../data/repositories/companies'
import { pendingLinkRequestForHm } from '../../../data/repositories/company-hm-link-requests'
import { pendingColdStartRoleIds } from '../../../data/repositories/cold-start-queue'
import { configValueByKey } from '../../../data/repositories/system-config'
import { ACTIVE } from './types'
import type {
  HMCacheSnapshot, CandidateRow, ProfilePreview, ContactInfo, WaitingInfo, RoleExtraInfo,
  HmReputation, FeedbackEntry,
} from './types'

/**
 * Owns the HM dashboard's data-loading + derived-state orchestration:
 * the initial multi-phase load, the realtime `matches` channel, every async
 * action handler, and the cached/derived KPI values. Behaviour is identical to
 * the inline implementation that previously lived in HMDashboard — this is a
 * verbatim relocation, not a redesign.
 */
export function useHmDashboardData(userId: string | undefined) {
  const { t } = useTranslation()
  // Hydrate KPI counts from local snapshot so the headline numbers don't
  // shimmer on returning visits. The candidate list itself is null-init'd
  // and skeletoned until fresh data arrives.
  const cachedSnap = useState(() => readDashCache<HMCacheSnapshot>('hm_dashboard', userId))[0]
  const [roleCount, setRoleCount] = useState<number | null>(cachedSnap?.roleCount ?? null)
  const [candidates, setCandidates] = useState<CandidateRow[] | null>(null)
  const [oldestRoleOver24h, setOldestRoleOver24h] = useState(false)
  const [waiting, setWaiting] = useState<WaitingInfo | null>(null)
  // `loading` previously gated the whole render via blocking spinner. With the
  // shell-always-rendered refactor, the value is no longer read; the setter is
  // retained as a no-op so the existing load() calls don't need to change.
  const setLoading = (_v: boolean) => { /* no-op */ }
  const [err, setErr] = useState<string | null>(null)
  const [roleExtras, setRoleExtras] = useState<RoleExtraInfo[]>([])
  const [unlockingRoleId, setUnlockingRoleId] = useState<string | null>(null)
  const [redeemingRoleId, setRedeemingRoleId] = useState<string | null>(null)
  const [unlockMsg, setUnlockMsg] = useState<{ roleId: string; tone: 'green' | 'red'; text: string } | null>(null)
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (reloadTimerRef.current !== null) clearTimeout(reloadTimerRef.current) }, [])
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])
  const [urgentRoleId, setUrgentRoleId] = useState<string | null>(null)
  const [urgentBusy, setUrgentBusy] = useState(false)
  const [urgentMsg, setUrgentMsg] = useState<{ tone: 'green' | 'amber' | 'red'; text: React.ReactNode } | null>(null)
  const [pointsBalance, setPointsBalance] = useState<number | null>(null)
  const URGENT_COST = 9
  const POINTS_PER_EXTRA = 21
  const [feedbackState, setFeedbackState] = useState<Record<string, FeedbackEntry>>({})
  const [hmReputation, setHmReputation] = useState<HmReputation | null>(null)
  const [hiredAllTime, setHiredAllTime] = useState<number>(0)
  const [companyVerified, setCompanyVerified] = useState<boolean | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [linkRequest, setLinkRequest] = useState<{ id: string; companyName: string } | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const [hmId, setHmId] = useState<string | null>(null)
  const [hmHasDob, setHmHasDob] = useState<boolean | null>(null)
  const [showAddDobModal, setShowAddDobModal] = useState(false)
  const [onboardingDraftRole, setOnboardingDraftRole] = useState<{ id: string; title: string; industry: string | null; salary_min: number | null; salary_max: number | null; work_arrangement: string | null; required_traits: string[] } | null>(null)
  const loadingRef = useRef(false)

  // Interview flow state
  const [roundsByMatch, setRoundsByMatch] = useState<Record<string, InterviewRound[]>>({})
  const [proposalsByMatch, setProposalsByMatch] = useState<Record<string, InterviewProposal[]>>({})
  const [previewByMatch, setPreviewByMatch] = useState<Record<string, ProfilePreview>>({})
  const [contactByMatch, setContactByMatch] = useState<Record<string, ContactInfo | null>>({})
  const [schedulingFor, setSchedulingFor] = useState<string | null>(null)
  const [scheduleSlots, setScheduleSlots] = useState<[string, string, string]>(['', '', ''])
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [respondMsg, setRespondMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)

  const loadRounds = useCallback(async (matchIds: string[]) => {
    if (matchIds.length === 0) return
    const { data, error } = await supabase
      .from('interview_rounds')
      .select('id, match_id, round_number, scheduled_at, interview_url, status, hm_notes')
      .in('match_id', matchIds)
      .order('round_number', { ascending: true })
    if (error) { setErr(error.message); return }
    if (!data) return
    const grouped: Record<string, InterviewRound[]> = {}
    for (const r of data) {
      if (!grouped[r.match_id]) grouped[r.match_id] = []
      grouped[r.match_id].push(r as InterviewRound)
    }
    setRoundsByMatch((prev) => ({ ...prev, ...grouped }))
  }, [])

  const loadProposals = useCallback(async (matchIds: string[]) => {
    if (matchIds.length === 0) return
    const { data, error } = await supabase
      .from('interview_proposals')
      .select('id, match_id, round_number, slot_1_at, slot_2_at, slot_3_at, status, picked_slot, decline_reason, created_at')
      .in('match_id', matchIds)
      .order('created_at', { ascending: false })
    if (error) { setErr(error.message); return }
    if (!data) return
    const grouped: Record<string, InterviewProposal[]> = {}
    for (const p of data) {
      if (!grouped[p.match_id]) grouped[p.match_id] = []
      grouped[p.match_id].push(p as InterviewProposal)
    }
    setProposalsByMatch((prev) => ({ ...prev, ...grouped }))
  }, [])

  const loadPreviews = useCallback(async (matchIds: string[]) => {
    if (matchIds.length === 0) return
    // One round-trip for all cards (was one RPC per card). Unauthorized/missing
    // ids are omitted by the RPC, so we backfill them with the null preview —
    // identical to the per-id path which swallowed those errors to null.
    const { data } = await supabase.rpc('get_match_profile_previews', { p_match_ids: matchIds })
    if (!mountedRef.current) return
    const byId = new Map(
      ((data ?? []) as Array<{ match_id: string } & ProfilePreview>).map((r) => [
        r.match_id,
        { display_name: r.display_name, photo_url: r.photo_url, privacy_mode: r.privacy_mode } as ProfilePreview,
      ]),
    )
    setPreviewByMatch((prev) => {
      const next = { ...prev }
      for (const id of matchIds) {
        next[id] = byId.get(id) ?? { display_name: null, photo_url: null, privacy_mode: null }
      }
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    let hmRoleIds: string[] = []
    // Watchdog: if any Supabase query stalls (no response, no error), the
    // try/catch never fires and the spinner hangs forever. Force-clear loading
    // after 12s so the user sees an error instead of an indefinite spinner.
    let watchdog: ReturnType<typeof setTimeout> | null = null

    async function load() {
      if (!userId) {
        if (!cancelled) { setCandidates([]); setRoleCount(0) }
        setLoading(false); return
      }
      loadingRef.current = true
      watchdog = setTimeout(() => {
        if (cancelled) return
        console.error('[hm-dashboard] load watchdog tripped — a Supabase query stalled')
        setErr(t('hmDash.loadingTimedOut'))
        // Settle the data slots so the skeleton doesn't shimmer forever; the
        // error banner above will tell the user what happened.
        setCandidates((cur) => cur ?? [])
        setRoleCount((cur) => cur ?? 0)
        setLoading(false)
      }, 20000)
      try {
      // Phase 1 — hiring_managers + profiles.points fire in parallel.
      // Both only depend on session.user.id.
      const [{ data: hm }, { data: pointsRow }] = await Promise.all([
        hmDashboardRowByProfileId(userId).maybeSingle(),
        profilePointsById(userId).maybeSingle(),
      ])
      if (!hm) {
        if (watchdog) { clearTimeout(watchdog); watchdog = null }
        if (!cancelled) { setCandidates([]); setRoleCount(0) }
        setLoading(false); return
      }
      if (!cancelled) {
        setHmId((hm as unknown as { id: string }).id)
        setHmHasDob((hm as unknown as { date_of_birth_encrypted: string | null }).date_of_birth_encrypted != null)
        setPointsBalance(pointsRow?.points ?? 0)
      }

      // Phase 2 — company-context lookup, active-role count, and role list
      // all fire in parallel. They share hm.id and don't depend on each other.
      const cid = (hm as unknown as { company_id: string | null }).company_id
      const companyOrLinkPromise = cid
        ? companyVerifiedById(cid).maybeSingle()
            .then((res) => ({ kind: 'company' as const, data: res.data }))
        : pendingLinkRequestForHm(hm.id)
            .maybeSingle()
            .then((res) => ({ kind: 'linkReq' as const, data: res.data }))

      const [companyOrLink, { count }, { data: roleRows }, { data: onboardingDraft }] = await Promise.all([
        companyOrLinkPromise,
        supabase.from('roles').select('id', { count: 'exact', head: true })
          .eq('hiring_manager_id', hm.id).eq('status', 'active'),
        supabase.from('roles')
          .select('id, title, status, extra_matches_used, created_at')
          .eq('hiring_manager_id', hm.id)
          .limit(200),
        supabase.from('roles').select('id, title, industry, salary_min, salary_max, work_arrangement, required_traits').eq('hiring_manager_id', hm.id)
          .eq('from_onboarding', true).eq('status', 'paused').maybeSingle(),
      ])
      if (!cancelled && onboardingDraft) setOnboardingDraftRole(onboardingDraft as typeof onboardingDraft & { required_traits: string[] })

      if (cid && !cancelled) setCompanyId(cid)
      if (companyOrLink.kind === 'company') {
        if (!cancelled) setCompanyVerified(companyOrLink.data?.verified ?? false)
      } else {
        if (!cancelled) setCompanyVerified(false)
        if (!cancelled && companyOrLink.data) {
          const co = companyOrLink.data.companies as unknown as { name: string } | null
          setLinkRequest({ id: companyOrLink.data.id, companyName: co?.name ?? t('hmDash.aCompany') })
        }
      }

      if (!cancelled) setHmReputation({
        reputation_score: (hm as unknown as { reputation_score: number | null }).reputation_score ?? null,
        feedback_volume: (hm as unknown as { feedback_volume: number }).feedback_volume ?? 0,
        phs_offer_accept_rate: (hm as unknown as { phs_offer_accept_rate: number | null }).phs_offer_accept_rate ?? null,
        hm_quality_factor: (hm as unknown as { hm_quality_factor: number | null }).hm_quality_factor ?? null,
        hm_cancel_rate: (hm as unknown as { hm_cancel_rate: number | null }).hm_cancel_rate ?? null,
      })

      if (!cancelled) setRoleCount(count ?? 0)

      hmRoleIds = (roleRows ?? []).map((r) => r.id)
      if (!cancelled && roleRows) {
        const activeCreatedAts = roleRows
          .filter((r) => r.status === 'active' && r.created_at)
          .map((r) => new Date(r.created_at).getTime())
        if (activeCreatedAts.length > 0) {
          const oldestMs = Math.min(...activeCreatedAts)
          setOldestRoleOver24h(Date.now() - oldestMs > 24 * 60 * 60 * 1000)
        }
      }

      // Phase 3 — fire every role-keyed query in parallel: hired-all-time count,
      // active candidates list, per-role active counts, cold-start queue. They
      // were sequential before, costing ~4× the RTT.
      const activeRows = ['generated','viewed','accepted_by_talent','invited_by_manager','hr_scheduling','interview_scheduled','interview_completed']
      const activeRoleIds = (roleRows ?? []).filter((r) => r.status === 'active').map((r) => r.id)

      const hiredCountPromise = hmRoleIds.length > 0
        ? hiredMatchCountForRoles(hmRoleIds)
        : Promise.resolve({ count: 0 })

      const activeCountsPromise = activeRoleIds.length > 0
        ? activeMatchRoleIds(activeRoleIds, activeRows)
        : Promise.resolve({ data: [] as Array<{ role_id: string }> })

      const coldRowsPromise = hmRoleIds.length > 0
        ? pendingColdStartRoleIds(hmRoleIds)
        : Promise.resolve({ data: [] as Array<{ role_id: string }> })

      const [hiredRes, { data: matchData, error }, activeCountsRes, coldRowsRes] = await Promise.all([
        hiredCountPromise,
        hmCandidatesForManager(hm.id, ACTIVE)
          .order('is_urgent', { ascending: false })
          .order('compatibility_score', { ascending: false }),
        activeCountsPromise,
        coldRowsPromise,
      ])
      if (cancelled) return

      const hiredAllTimeCount = (hiredRes as { count: number | null }).count ?? 0
      if (!cancelled) setHiredAllTime(hiredAllTimeCount)

      if (error) setErr(error.message)
      else {
        const rows = (matchData ?? []) as unknown as CandidateRow[]
        setCandidates(rows)
        // Cache aggregates only — no candidate IDs / scores / status detail.
        const actionNeededLocal = rows.filter((c) => ['generated', 'viewed', 'accepted_by_talent'].includes(c.status)).length
        writeDashCache<HMCacheSnapshot>('hm_dashboard', userId, {
          roleCount: (count ?? 0),
          candidatesCount: rows.length,
          actionNeededCount: actionNeededLocal,
          hiredAllTime: hiredAllTimeCount,
        })
        // Load rounds + pending proposals for interview-stage matches.
        const interviewMatchIds = rows
          .filter((r) => ['invited_by_manager', 'interview_scheduled', 'interview_completed', 'offer_made'].includes(r.status))
          .map((r) => r.id)
        // Profile previews are loaded for *every* surfaced candidate so the
        // HM can see the real name + photo on public-mode talents from the
        // moment a card appears, not just at the interview stage.
        const previewMatchIds = rows.map((r) => r.id)
        await Promise.all([
          loadRounds(interviewMatchIds),
          loadProposals(interviewMatchIds),
          loadPreviews(previewMatchIds),
        ])
      }

      if (activeRoleIds.length > 0) {
        const activeCounts = (activeCountsRes as { data: Array<{ role_id: string }> | null }).data ?? []
        const countByRole: Record<string, number> = {}
        for (const m of activeCounts) {
          countByRole[m.role_id] = (countByRole[m.role_id] ?? 0) + 1
        }
        const extras: RoleExtraInfo[] = (roleRows ?? [])
          .filter((r) => r.status === 'active')
          .map((r) => ({ id: r.id, title: r.title, activeCount: countByRole[r.id] ?? 0, extraUsed: r.extra_matches_used ?? 0 }))
        if (!cancelled) setRoleExtras(extras)
      }

      const coldRows = (coldRowsRes as { data: Array<{ role_id: string }> | null }).data ?? []
      if (coldRows.length > 0) {
        const [{ data: cfg }, { data: talentCountResp }] = await Promise.all([
          configValueByKey('waiting_period_thresholds').maybeSingle(),
          supabase.rpc('active_talent_count'),
        ])
        const thresholds = (cfg?.value as Array<{ min_talents: number; max_talents: number; days: number }> | undefined) ?? []
        const n = typeof talentCountResp === 'number' ? talentCountResp : 0
        const band = thresholds.find((t) => n >= t.min_talents && n < t.max_talents)
        if (!cancelled) setWaiting({ roleCount: coldRows.length, estimatedDays: band?.days ?? 14 })
      }
      if (watchdog) { clearTimeout(watchdog); watchdog = null }
      // If the watchdog fired but the queries ultimately resolved, the page is
      // fully loaded — clear the now-stale "timed out" banner.
      if (!cancelled) setErr((cur) => cur === t('hmDash.loadingTimedOut') ? null : cur)
      setLoading(false)
      } catch (e) {
        if (watchdog) { clearTimeout(watchdog); watchdog = null }
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : t('hmDash.loadFailed'))
          // Failed mid-load — settle skeletons so the error banner shows
          // against a stable layout instead of indefinite shimmer.
          setCandidates((cur) => cur ?? [])
          setRoleCount((cur) => cur ?? 0)
          setLoading(false)
        }
      } finally {
        loadingRef.current = false
      }
    }
    // Subscribe AFTER load() resolves so hmRoleIds is populated and we can
    // set a server-side filter — avoids leaking match events across tenants.
    let channel: ReturnType<typeof supabase.channel> | null = null
    let resubscribing = false

    function subscribeMatches() {
      if (cancelled || hmRoleIds.length === 0) return
      // Tear down any existing channel synchronously before creating a new one.
      // The channel name is stable per user, so removing the prior channel here
      // keeps resubscribe safe (a stable name cannot double-subscribe) and avoids
      // the per-mount connection churn the old `-${Date.now()}` suffix caused.
      if (channel) { void supabase.removeChannel(channel); channel = null }
      channel = supabase
        .channel(`hm-matches-${userId ?? 'anon'}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'matches',
          // TODO(realtime-scope): switch to a single stable equality filter
          // `hm_id=eq.<hmId>` once the denormalised column lands (migration
          // 0172_matches_hm_id_for_realtime.sql). That removes the grow-with-roles
          // comma-list and the unknown-role reload/resubscribe dance below.
          filter: `role_id=in.(${hmRoleIds.join(',')})`,
        }, handleMatchChange)
        .subscribe()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function handleMatchChange(payload: any) {
      const next = payload.new as { id: string; role_id?: string; status?: string } | null
      const prev = payload.old as { id: string; role_id?: string } | null
      const touched = next?.role_id ?? prev?.role_id
      if (!touched) return
      if (!hmRoleIds.includes(touched)) {
        // Unknown role_id — a new role was created after the initial load.
        // Re-run load() to pick it up, then resubscribe with the updated
        // hmRoleIds so the filter stays current. Guard concurrent unknown-role
        // INSERTs with `resubscribing` so they coalesce into ONE reload+
        // resubscribe instead of each racing to swap the channel (which orphaned
        // subscriptions). subscribeMatches() tears down the prior channel itself.
        if (payload.eventType === 'INSERT' && !resubscribing) {
          resubscribing = true
          void load().then(() => {
            resubscribing = false
            subscribeMatches()
          })
        }
        return
      }
      if (payload.eventType === 'DELETE') setCandidates((xs) => (xs ?? []).filter((c) => c.id !== prev?.id))
      else if (payload.eventType === 'UPDATE' && next) setCandidates((xs) => (xs ?? []).map((c) => (c.id === next.id ? { ...c, ...next } : c)))
      else if (payload.eventType === 'INSERT') { if (!loadingRef.current) void load() }
    }

    void load().then(() => subscribeMatches())

    return () => {
      cancelled = true
      if (watchdog) clearTimeout(watchdog)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [userId, loadRounds, loadProposals, loadPreviews])

  async function handleUrgentSearch(roleId: string) {
    setUrgentMsg(null); setErr(null)
    if (pointsBalance != null && pointsBalance < URGENT_COST) {
      setUrgentMsg({
        tone: 'amber',
        text: (
          <>
            {t('hmDash.urgentNeedPoints', { cost: URGENT_COST, have: pointsBalance })}{' '}
            <Link to="/points" className="font-semibold underline hover:text-ink-900 dark:hover:text-white">
              {t('hmDash.buyOrEarnMore')}
            </Link>
          </>
        ),
      })
      return
    }
    if (!(await confirmDialog({
      title: t('hmDash.urgentConfirmTitle', 'Use priority search?'),
      message: t('hmDash.urgentConfirm', { cost: URGENT_COST }),
      confirmLabel: t('common.confirm', 'Confirm'),
    }))) return
    setUrgentRoleId(roleId); setUrgentBusy(true)
    try {
      const res = await callFunction<{
        success: boolean
        cost: number
        balance_after: number
        result: { kind: 'match'; match_id: string; talent_id: string; compatibility_score: number | null } | null
        message?: string
      }>('urgent-priority-search', { request_type: 'find_worker', role_id: roleId })
      if (!mountedRef.current) return
      if (typeof res.balance_after === 'number') setPointsBalance(res.balance_after)
      if (!res.result) {
        setUrgentMsg({ tone: 'amber', text: res.message ?? t('hmDash.noCandidateNow') })
      } else {
        setUrgentMsg({
          tone: 'green',
          text: t('hmDash.urgentReady', { pct: Math.round(res.result.compatibility_score ?? 0), balance: res.balance_after }),
        })
      }
    } catch (e) {
      if (!mountedRef.current) return
      setUrgentMsg({ tone: 'red', text: e instanceof Error ? e.message : t('hmDash.urgentSearchFailed') })
    } finally {
      if (mountedRef.current) { setUrgentBusy(false); setUrgentRoleId(null) }
    }
  }

  async function handleUnlockExtra(roleId: string) {
    setErr(null); setUnlockMsg(null); setUnlockingRoleId(roleId)
    try {
      const res = await callFunction<{ paymentUrl: string }>('unlock-extra-match', {
        match_type: 'hm_extra', role_id: roleId,
      })
      if (res?.paymentUrl) window.location.href = res.paymentUrl
      else setUnlockMsg({ roleId, tone: 'red', text: t('hmDash.paymentNoUrl') })
    } catch (e) {
      console.error('[unlock-extra-match] failed', e)
      setUnlockMsg({ roleId, tone: 'red', text: e instanceof Error ? e.message : t('hmDash.paymentStartFailed') })
    } finally { setUnlockingRoleId(null) }
  }

  async function handleRedeemExtra(roleId: string, roleTitle: string) {
    setErr(null); setUnlockMsg(null)
    if (pointsBalance != null && pointsBalance < POINTS_PER_EXTRA) {
      setUnlockMsg({
        roleId, tone: 'red',
        text: t('hmDash.redeemNeedPoints', { points: POINTS_PER_EXTRA, have: pointsBalance }),
      })
      return
    }
    if (!(await confirmDialog({
      title: t('hmDash.redeemConfirmTitle', 'Redeem points?'),
      message: t('hmDash.redeemConfirm', { points: POINTS_PER_EXTRA, role: roleTitle }),
      confirmLabel: t('common.confirm', 'Confirm'),
    }))) return
    setRedeemingRoleId(roleId)
    try {
      await callFunction<{ message: string; cost: number }>('redeem-points', {
        target_type: 'role', role_id: roleId,
      })
      setUnlockMsg({
        roleId, tone: 'green',
        text: t('hmDash.redeemSuccess', { points: POINTS_PER_EXTRA }),
      })
      setPointsBalance((p) => (p == null ? p : p - POINTS_PER_EXTRA))
      setRoleExtras((prev) => prev.map((r) => r.id === roleId ? { ...r, extraUsed: r.extraUsed + 1 } : r))
      // Refresh the dashboard so the new match appears once match-generate finishes.
      reloadTimerRef.current = setTimeout(() => { window.location.reload() }, 1500)
    } catch (e) {
      console.error('[redeem-points] failed', e)
      setUnlockMsg({ roleId, tone: 'red', text: e instanceof Error ? e.message : t('hmDash.redeemFailed') })
    } finally { setRedeemingRoleId(null) }
  }

  async function viewResume(matchId: string) {
    if (companyVerified === false) {
      setErr(t('hmDash.resumeLocked'))
      return
    }
    setActionBusy(`${matchId}:resume`)
    try {
      const res = await callFunction<{ signed_url?: string; error?: string; message?: string }>('get-resume-url', { match_id: matchId })
      if (res?.signed_url) {
        window.open(res.signed_url, '_blank', 'noopener,noreferrer')
      } else {
        setErr(res?.message ?? res?.error ?? t('hmDash.resumeLoadFailed'))
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('hmDash.resumeLoadFailed'))
    } finally {
      setActionBusy(null)
    }
  }

  async function respond(id: string, next: 'invited_by_manager' | 'declined_by_manager') {
    if (next === 'invited_by_manager' && companyVerified === false) {
      setErr(t('hmDash.askHrUpload'))
      setRespondMsg({ tone: 'red', text: t('hmDash.inviteLocked') })
      window.setTimeout(() => setRespondMsg((m) => (m && m.tone === 'red' ? null : m)), 6000)
      return
    }
    setErr(null)
    setRespondMsg(null)
    const actionLabel = next === 'invited_by_manager' ? 'invite' : 'decline'
    setActionBusy(`${id}:${actionLabel}`)
    const prevStatus = candidates?.find((c) => c.id === id)?.status
    setCandidates((cs) => (cs ?? []).map((c) => (c.id === id ? { ...c, status: next } : c)))

    // State machine requires generated → viewed before viewed → invited_by_manager or
    // viewed → declined_by_manager. Advance through 'viewed' first so both actions are
    // legal from the HM's perspective regardless of which they pick first.
    if (prevStatus === 'generated') {
      const { error: viewErr } = await updateMatch(id, { status: 'viewed' })
      if (!mountedRef.current) return
      if (viewErr) {
        setErr(viewErr.message)
        if (prevStatus) setCandidates((cs) => (cs ?? []).map((c) => (c.id === id ? { ...c, status: prevStatus } : c)))
        setActionBusy(null)
        return
      }
    }

    const { error } = await updateMatch(id, {
      status: next,
      invited_at: next === 'invited_by_manager' ? new Date().toISOString() : null,
    })
    if (!mountedRef.current) return
    if (error) {
      setErr(error.message)
      if (prevStatus) {
        setCandidates((cs) => (cs ?? []).map((c) => (c.id === id ? { ...c, status: prevStatus } : c)))
      }
      setActionBusy(null)
      return
    }
    setRespondMsg({
      tone: 'green',
      text: next === 'invited_by_manager'
        ? t('hmDash.invitationSent')
        : t('hmDash.candidateDeclined'),
    })
    setActionBusy(null)
    window.setTimeout(() => setRespondMsg((m) => (m && m.tone === 'green' ? null : m)), 4500)
    const event_type = next === 'invited_by_manager' ? 'accept_interview' : 'reject_with_reason'
    try { await callFunction('award-points', { event_type, match_id: id }) } catch { /* tolerate */ }
  }

  async function doAction(matchId: string, action: string, extra?: Record<string, unknown>) {
    if (['schedule_round', 'make_offer', 'mark_hired'].includes(action) && companyVerified === false) {
      setErr(t('hmDash.askHrUpload'))
      return
    }
    setErr(null)
    setActionBusy(`${matchId}:${action}`)
    // Optimistic UI — predict the next status so the click feels instant
    // while the edge function (which may cold-start) is in flight.
    const prev = candidates?.find((c) => c.id === matchId) ?? null
    const optimisticStatus: Record<string, string> = {
      make_offer: 'offer_made',
      mark_hired: 'hired',
      cancel_match: 'cancelled',
      complete_interviews: 'interview_completed',
      // schedule_round now creates a *proposal* (not a round) and leaves match
      // status at invited_by_manager until the talent picks a slot. The proposal
      // panel is what flips the UI, so no optimistic status change here.
    }
    const nextStatus = optimisticStatus[action]
    if (nextStatus) {
      setCandidates((cs) => (cs ?? []).map((c) => (c.id === matchId ? { ...c, status: nextStatus } : c)))
    }
    if (action === 'schedule_round') {
      // Close the picker immediately — the function will confirm asynchronously.
      setSchedulingFor(null)
      setScheduleSlots(['', '', ''])
    }
    try {
      await callFunction('interview-action', { action, match_id: matchId, ...extra })
      if (!mountedRef.current) return
      // Reconcile the canonical row + rounds in the background. Don't block
      // actionBusy clearing on these — realtime usually catches it first.
      void hmCandidateById(matchId)
        .maybeSingle()
        .then(({ data: updated }) => {
          if (updated) setCandidates((cs) => (cs ?? []).map((c) => (c.id === matchId ? (updated as unknown as CandidateRow) : c)))
        })
      void loadRounds([matchId])
      void loadProposals([matchId])
    } catch (e) {
      if (!mountedRef.current) return
      if (prev) setCandidates((cs) => (cs ?? []).map((c) => (c.id === matchId ? prev : c)))
      setErr(e instanceof Error ? e.message : t('hmDash.actionFailed', { action }))
    } finally {
      if (mountedRef.current) setActionBusy(null)
    }
  }

  async function revealContact(matchId: string) {
    if (companyVerified === false) {
      setErr(t('hmDash.askHrUpload'))
      return
    }
    setErr(null)
    try {
      const { data, error } = await supabase.rpc('get_talent_contact', { p_match_id: matchId })
      if (!mountedRef.current) return
      if (error) { setErr(error.message); return }
      const row = Array.isArray(data) ? data[0] : data
      setContactByMatch((prev) => ({ ...prev, [matchId]: row ?? null }))
    } catch (e) {
      if (!mountedRef.current) return
      setErr(e instanceof Error ? e.message : t('hmDash.contactRetrieveFailed'))
    }
  }

  async function submitFeedback(matchId: string) {
    const fb = feedbackState[matchId]
    if (!fb || fb.rating === 0) return
    setFeedbackState((s) => ({ ...s, [matchId]: { ...s[matchId], saving: true } }))
    try {
      const result = await callFunction<{ success: boolean; points_awarded: number }>('submit-feedback', {
        match_id: matchId,
        stage: 'interview',
        from_party: 'hm',
        rating: fb.rating,
        ...(fb.outcome && { outcome: fb.outcome }),
        ...(fb.freeText.trim() && { free_text: fb.freeText.trim() }),
      })
      if (!mountedRef.current) return
      setFeedbackState((s) => ({
        ...s,
        [matchId]: { ...s[matchId], saving: false, saved: true, pointsAwarded: result?.points_awarded ?? 0 },
      }))
      if ((result?.points_awarded ?? 0) > 0) setPointsBalance((prev) => (prev ?? 0) + result.points_awarded)
    } catch (e) {
      if (!mountedRef.current) return
      setFeedbackState((s) => ({ ...s, [matchId]: { ...s[matchId], saving: false } }))
      setErr(e instanceof Error ? e.message : t('hmDash.feedbackSaveFailed'))
    }
  }

  // Shell always renders; sections skeleton themselves. Cached counts (if any)
  // keep the KPI strip from shimmering on returning visits.
  const candidatesCount = candidates != null ? candidates.length : cachedSnap?.candidatesCount ?? null
  const actionNeeded = candidates != null
    ? candidates.filter((c) => ['generated', 'viewed', 'accepted_by_talent'].includes(c.status)).length
    : cachedSnap?.actionNeededCount ?? null
  const roleCountForStat = roleCount ?? null
  const hiredAllTimeForStat = candidates != null ? hiredAllTime : cachedSnap?.hiredAllTime ?? null

  async function respondToLinkRequest(action: 'accept' | 'decline') {
    if (!linkRequest) return
    setLinkBusy(true)
    try {
      await callFunction('link-hm', { request_id: linkRequest.id, action })
      if (!mountedRef.current) return
      setLinkRequest(null)
      if (action === 'accept') window.location.reload()
    } catch (e) {
      setErr(formatError(e))
    }
    if (mountedRef.current) setLinkBusy(false)
  }

  return {
    // pricing constants
    URGENT_COST,
    POINTS_PER_EXTRA,
    // raw state
    roleCount,
    candidates,
    oldestRoleOver24h,
    waiting,
    err,
    roleExtras,
    unlockingRoleId,
    redeemingRoleId,
    unlockMsg,
    urgentRoleId,
    urgentBusy,
    urgentMsg,
    pointsBalance,
    feedbackState,
    setFeedbackState,
    hmReputation,
    companyVerified,
    companyId,
    linkRequest,
    linkBusy,
    hmId,
    hmHasDob,
    setHmHasDob,
    showAddDobModal,
    setShowAddDobModal,
    onboardingDraftRole,
    roundsByMatch,
    proposalsByMatch,
    previewByMatch,
    contactByMatch,
    schedulingFor,
    setSchedulingFor,
    scheduleSlots,
    setScheduleSlots,
    actionBusy,
    respondMsg,
    // derived KPI values
    candidatesCount,
    actionNeeded,
    roleCountForStat,
    hiredAllTimeForStat,
    // action handlers
    handleUrgentSearch,
    handleUnlockExtra,
    handleRedeemExtra,
    viewResume,
    respond,
    doAction,
    revealContact,
    submitFeedback,
    respondToLinkRequest,
  }
}
