import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { fmt } from '../../lib/format'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'
import { useSeo } from '../../lib/useSeo'
import { getDisplayName } from '../../lib/displayName'
import { formatError } from '../../lib/errors'
import { readDashCache, writeDashCache } from '../../lib/dashboardCache'
import Skeleton, { SkeletonCard } from '../../components/Skeleton'
import { Button, Card, Badge, Alert, EmptyState, PageHeader, Stat } from '../../components/ui'

/** HM dashboard KPI snapshot — safe-to-cache aggregates only. */
interface HMCacheSnapshot {
  roleCount: number
  candidatesCount: number
  actionNeededCount: number
  hiredAllTime: number
}
import MatchExplain from '../../components/MatchExplain'
import ScreeningChecklist from '../../components/ScreeningChecklist'
import CareerNudgePanel from '../../components/CareerNudgePanel'
import AddHmDobModal from '../../components/AddHmDobModal'
import type { PublicReasoning, CultureComparison, InterviewRound, InterviewProposal } from '../../types/db'
import { hmCandidatesForManager, hmCandidateById, updateMatch, hiredMatchCountForRoles, activeMatchRoleIds } from '../../data/repositories/matches'

type TFn = (key: string, opts?: Record<string, unknown>) => string
const hmOutcomes = (t: TFn) => [
  { value: '', label: t('hmDash.outcomeSelect') },
  { value: 'great_hire',       label: t('hmDash.outcomeGreatHire') },
  { value: 'good_interview',   label: t('hmDash.outcomeGoodInterview') },
  { value: 'offer_declined',   label: t('hmDash.outcomeOfferDeclined') },
  { value: 'hired_left_early', label: t('hmDash.outcomeLeftEarly') },
  { value: 'poor_interview',   label: t('hmDash.outcomePoorInterview') },
  { value: 'no_show',          label: t('hmDash.outcomeNoShow') },
]

interface CandidateRow {
  id: string
  compatibility_score: number | null
  status: string
  is_urgent?: boolean | null
  public_reasoning: PublicReasoning | null
  application_summary: string | null
  talents: {
    id: string
    privacy_mode: string
    derived_tags: Record<string, number> | null
    expected_salary_min: number | null
    expected_salary_max: number | null
  } | null
  roles: { id: string; title: string } | null
  match_feedback: { rating: number; hired: boolean; notes: string | null }[] | null
}

interface ProfilePreview {
  display_name: string | null
  photo_url: string | null
  privacy_mode: string | null
}

interface ContactInfo {
  full_name: string
  email: string
  phone: string | null
}

interface WaitingInfo { roleCount: number; estimatedDays: number }
interface RoleExtraInfo { id: string; title: string; activeCount: number; extraUsed: number }

const ACTIVE = [
  'generated', 'viewed', 'accepted_by_talent',
  'invited_by_manager', 'hr_scheduling',
  'interview_scheduled', 'interview_completed',
  'offer_made',
]

export default function HMDashboard() {
  const { t } = useTranslation()
  useSeo({ title: t('hmDash.seoTitle'), noindex: true })
  const { session, profile } = useSession()
  const userId = session?.user.id
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
  const [feedbackState, setFeedbackState] = useState<Record<string, { rating: number; hired: boolean; notes: string; outcome: string; freeText: string; saving: boolean; saved: boolean; pointsAwarded?: number }>>({})
  const [hmReputation, setHmReputation] = useState<{ reputation_score: number | null; feedback_volume: number; phs_offer_accept_rate: number | null; hm_quality_factor: number | null; hm_cancel_rate: number | null } | null>(null)
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
        supabase.from('hiring_managers').select('id, company_id, reputation_score, feedback_volume, phs_offer_accept_rate, hm_quality_factor, hm_cancel_rate, date_of_birth_encrypted').eq('profile_id', userId).maybeSingle(),
        supabase.from('profiles').select('points').eq('id', userId).maybeSingle(),
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
        ? supabase.from('companies').select('verified').eq('id', cid).maybeSingle()
            .then((res) => ({ kind: 'company' as const, data: res.data }))
        : supabase.from('company_hm_link_requests')
            .select('id, companies(name)')
            .eq('hm_id', hm.id)
            .eq('status', 'pending')
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
        ? supabase.from('cold_start_queue').select('role_id')
            .in('role_id', hmRoleIds).eq('status', 'pending')
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
          supabase.from('system_config').select('value').eq('key', 'waiting_period_thresholds').maybeSingle(),
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
      // Each channel name is unique (Date.now()), so a dropped reference would
      // leak the prior subscription — removing it here makes resubscribe safe
      // even if two callers race.
      if (channel) { void supabase.removeChannel(channel); channel = null }
      channel = supabase
        .channel(`hm-matches-${userId ?? 'anon'}-${Date.now()}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'matches',
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
            <Link to="/points" className="font-semibold underline hover:text-ink-900">
              {t('hmDash.buyOrEarnMore')}
            </Link>
          </>
        ),
      })
      return
    }
    if (!window.confirm(t('hmDash.urgentConfirm', { cost: URGENT_COST }))) return
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
    if (!window.confirm(t('hmDash.redeemConfirm', { points: POINTS_PER_EXTRA, role: roleTitle }))) return
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

  return (
    <div>
      {/* Pending company link request banner */}
      {linkRequest && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-900">
              {t('hmDash.linkRequestTitle', { company: linkRequest.companyName })}
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              {t('hmDash.linkRequestBody')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={linkBusy} loading={linkBusy} onClick={() => void respondToLinkRequest('accept')}>
              {t('hmDash.accept')}
            </Button>
            <Button size="sm" variant="secondary" disabled={linkBusy} onClick={() => void respondToLinkRequest('decline')}>
              {t('hmDash.decline')}
            </Button>
          </div>
        </div>
      )}

      <PageHeader
        eyebrow={profile && t('dashboard.hmGreeting', { name: getDisplayName(profile) })}
        title={t('hmDash.pageTitle')}
        description={t('hmDash.pageDescription')}
        actions={
          <>
            <Link to="/hm/org-chart" className="btn-secondary">{t('hmDash.orgChartConsultant')}</Link>
            <Link to="/hm/roles" className="btn-secondary">{t('hmDash.myRoles')}</Link>
            <Link to="/hm/post-role" className="btn-primary">{t('hmDash.postRole')}</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label={t('hmDash.statActiveRoles')} value={roleCountForStat == null ? <Skeleton width={40} height={28} /> : roleCountForStat} />
        <Stat label={t('hmDash.statCandidates')} value={candidatesCount == null ? <Skeleton width={40} height={28} /> : candidatesCount} />
        <Stat label={t('hmDash.statAwaitingYou')} value={actionNeeded == null ? <Skeleton width={40} height={28} /> : actionNeeded} tone={(actionNeeded ?? 0) > 0 ? 'brand' : 'default'} />
        <Stat label={t('hmDash.statHiredAllTime')} value={hiredAllTimeForStat == null ? <Skeleton width={40} height={28} /> : hiredAllTimeForStat} />
      </div>

      <CareerNudgePanel side="hm" />

      {hmReputation && hmReputation.feedback_volume > 0 && (
        <EmployerReputationPanel reputation={hmReputation} />
      )}

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}
      {respondMsg && <div className="mb-6"><Alert tone={respondMsg.tone}>{respondMsg.text}</Alert></div>}

      {hmHasDob === false && (
        <div className="mb-6">
          <Alert tone="amber" title={t('hmDash.dobAlertTitle')}>
            {t('hmDash.dobAlertBody')}
            <div className="mt-2">
              <Button size="sm" onClick={() => setShowAddDobModal(true)}>{t('hmDash.dobAddNow')}</Button>
            </div>
          </Alert>
        </div>
      )}

      {companyVerified === false && companyId && (
        <div className="mb-6">
          <Alert tone="amber" title={t('hmDash.companyPendingTitle')}>
            {t('hmDash.companyPendingBody')}{' '}
            <a
              href={`/onboarding/company/verify?company=${companyId}`}
              className="font-semibold underline"
              target="_blank"
              rel="noreferrer"
            >
              {t('hmDash.companyPendingLink')}
            </a>
            {' '}{t('hmDash.companyPendingTail')}
          </Alert>
        </div>
      )}

      {(roleCount ?? 0) > 0 && (
        <div className="mb-6">
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <span className="font-semibold">{t('hmDash.moreMatchesTitle')}</span>{' '}
            {t('hmDash.moreMatchesBody')}
            {' '}<span className="font-semibold">{t('hmDash.moreMatchesRatio')}</span>
          </div>
        </div>
      )}

      {waiting && (
        <div className="mb-6">
          <Alert tone="amber" title={t('hmDash.coldStartTitle', { roles: waiting.roleCount === 1 ? t('hmDash.coldStartOneRole') : t('hmDash.coldStartManyRoles', { count: waiting.roleCount }) })}>
            {t('hmDash.coldStartBody')}{' '}
            <strong>{t('hmDash.coldStartEstimate', { days: waiting.estimatedDays })}</strong>.
          </Alert>
        </div>
      )}

      {/* Schedule round modal — HM proposes 3 slots, talent picks one */}
      {schedulingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-1">{t('hmDash.proposeTimesTitle')}</h2>
            <p className="text-xs text-ink-500 mb-4">
              {t('hmDash.proposeTimesHint')}
            </p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="mb-3">
                <label htmlFor={`hm-slot-${i + 1}`} className="block text-xs mb-1 text-ink-700 font-medium">
                  {t('hmDash.slot', { n: i + 1 })}
                </label>
                <input
                  id={`hm-slot-${i + 1}`}
                  type="datetime-local"
                  value={scheduleSlots[i]}
                  onChange={(e) => setScheduleSlots((s) => {
                    const next: [string, string, string] = [...s] as [string, string, string]
                    next[i] = e.target.value
                    return next
                  })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ))}
            <div className="flex gap-3 mt-4">
              <Button
                disabled={scheduleSlots.some((s) => !s) || actionBusy !== null}
                loading={actionBusy === `${schedulingFor}:schedule_round`}
                onClick={() => {
                  const [s1, s2, s3] = scheduleSlots
                  void doAction(schedulingFor, 'schedule_round', {
                    slot_1_at: new Date(s1).toISOString(),
                    slot_2_at: new Date(s2).toISOString(),
                    slot_3_at: new Date(s3).toISOString(),
                  })
                }}
              >
                {t('hmDash.sendToCandidate')}
              </Button>
              <Button variant="secondary" onClick={() => { setSchedulingFor(null); setScheduleSlots(['', '', '']) }}>
                {t('hmDash.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {candidates == null ? (
        // Pre-fetch: show 2 skeleton candidate cards.
        <div className="grid md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : candidates.length === 0 ? (
        onboardingDraftRole ? (
          <div className="rounded-xl border-2 border-brand-500 bg-white overflow-hidden shadow-sm">
            <div className="bg-brand-600 px-5 py-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-white shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.3 3.3 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
              </svg>
              <span className="text-white font-semibold text-sm">{t('hmDash.draftBannerTitle')}</span>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900">{onboardingDraftRole.title}</h3>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                {onboardingDraftRole.industry && <span>{onboardingDraftRole.industry}</span>}
                {(onboardingDraftRole.salary_min || onboardingDraftRole.salary_max) && (
                  <span>RM {fmt(onboardingDraftRole.salary_min)} – {fmt(onboardingDraftRole.salary_max)}</span>
                )}
                {onboardingDraftRole.work_arrangement && (
                  <span className="capitalize">{onboardingDraftRole.work_arrangement.replace(/_/g, '-')}</span>
                )}
              </div>
              {onboardingDraftRole.required_traits?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {onboardingDraftRole.required_traits.map((tr) => (
                    <Badge key={tr}>{tr.replace(/_/g, ' ')}</Badge>
                  ))}
                </div>
              )}
              <p className="mt-4 text-sm text-gray-600">
                {t('hmDash.draftReviewHint')}
              </p>
              <div className="mt-5">
                <Link
                  to={`/hm/post-role/${onboardingDraftRole.id}`}
                  className="btn-primary inline-flex items-center gap-2 text-base px-6 py-3"
                >
                  {t('hmDash.draftActivateCta')}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <Card>
            <EmptyState
              title={roleCount === 0 ? t('hmDash.emptyPostFirstTitle') : oldestRoleOver24h ? t('hmDash.emptyNoMatchesTitle') : t('hmDash.emptyCuratingTitle')}
              description={roleCount === 0
                ? t('hmDash.emptyPostFirstDesc')
                : oldestRoleOver24h
                  ? t('hmDash.emptyNoMatchesDesc')
                  : t('hmDash.emptyCuratingDesc')}
              action={roleCount === 0 ? <Link to="/hm/post-role" className="btn-primary">{t('hmDash.postRole')}</Link> : undefined}
            />
          </Card>
        )
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {candidates.map((c) => {
            const proposals = proposalsByMatch[c.id] ?? []
            const pendingProposal = proposals.find((p) => p.status === 'pending') ?? null
            return (
              <CandidateCard
                key={c.id}
                row={c}
                rounds={roundsByMatch[c.id] ?? []}
                pendingProposal={pendingProposal}
                preview={previewByMatch[c.id] ?? null}
                contact={contactByMatch[c.id]}
                actionBusy={actionBusy}
                schedulingFor={schedulingFor}
                companyVerified={companyVerified}
                companyId={companyId}
                onInvite={() => void respond(c.id, 'invited_by_manager')}
                onDecline={() => void respond(c.id, 'declined_by_manager')}
                onScheduleRound={() => setSchedulingFor(c.id)}
                onCancelProposal={(proposalId) => void doAction(c.id, 'cancel_interview_proposal', { proposal_id: proposalId })}
                onCompleteInterviews={() => void doAction(c.id, 'complete_interviews')}
                onMakeOffer={() => void doAction(c.id, 'make_offer')}
                onMarkHired={() => void doAction(c.id, 'mark_hired')}
                onCancel={() => void doAction(c.id, 'cancel_match')}
                onRevealContact={() => void revealContact(c.id)}
                onViewResume={() => void viewResume(c.id)}
                feedbackEntry={feedbackState[c.id] ?? { rating: c.match_feedback?.[0]?.rating ?? 0, hired: c.match_feedback?.[0]?.hired ?? false, notes: c.match_feedback?.[0]?.notes ?? '', outcome: '', freeText: '', saving: false, saved: !!c.match_feedback?.[0] }}
                onFeedbackChange={(patch) => setFeedbackState((s) => ({ ...s, [c.id]: { ...(s[c.id] ?? { rating: 0, hired: false, notes: '', outcome: '', freeText: '', saving: false, saved: false }), ...patch } }))}
                onFeedbackSubmit={() => void submitFeedback(c.id)}
              />
            )
          })}
        </div>
      )}

      {roleExtras.length > 0 && (
        <Card className="mt-8 border-2 border-amber-400 bg-amber-50/40">
          <div className="p-6">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-sm font-semibold text-amber-900 mb-0.5">
                  {t('hmDash.urgentSearchTitle', { cost: URGENT_COST })}
                </div>
                <p className="text-sm text-ink-600">
                  {t('hmDash.urgentSearchDesc')}
                </p>
              </div>
              {pointsBalance != null && (
                <div className="text-xs text-ink-600 whitespace-nowrap">
                  {t('hmDash.balanceLabel')} <span className="font-semibold text-ink-900">{t('hmDash.pointsValue', { n: pointsBalance })}</span>
                </div>
              )}
            </div>
            {urgentMsg && (
              <div className="mb-3">
                <Alert tone={urgentMsg.tone}>{urgentMsg.text}</Alert>
              </div>
            )}
            <div className="space-y-2">
              {roleExtras.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 pt-3 first:border-t-0 first:pt-0">
                  <div>
                    <div className="text-sm font-medium text-ink-900">{r.title}</div>
                    <div className="text-xs text-ink-500">{t('hmDash.activeCandidatesCount', { count: r.activeCount })}</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void handleUrgentSearch(r.id)}
                    disabled={urgentBusy}
                  >
                    {urgentBusy && urgentRoleId === r.id ? t('hmDash.searching') : t('hmDash.urgentButton', { cost: URGENT_COST })}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {roleExtras.some((r) => r.activeCount >= 3 && r.extraUsed < 3) && (
        <Card className="mt-8 border-dashed border-accent-500">
          <div className="p-6">
            <div className="text-sm font-medium text-ink-900 mb-1">{t('hmDash.needMoreTitle')}</div>
            <p className="text-sm text-ink-500 mb-4">
              {t('hmDash.needMoreBody', { points: POINTS_PER_EXTRA })}{pointsBalance != null ? t('hmDash.needMoreBalance', { balance: pointsBalance }) : ''}
            </p>
            <div className="space-y-2">
              {roleExtras
                .filter((r) => r.activeCount >= 3 && r.extraUsed < 3)
                .map((r) => {
                  const busy = unlockingRoleId === r.id || redeemingRoleId === r.id
                  const insufficientPoints = pointsBalance != null && pointsBalance < POINTS_PER_EXTRA
                  return (
                    <div key={r.id} className="border-t border-ink-100 pt-3 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-ink-900">{r.title}</div>
                          <div className="text-xs text-ink-500">{t('hmDash.extraUnlocksRemaining', { count: 3 - r.extraUsed })}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {insufficientPoints ? (
                            <Link
                              to="/points"
                              className="inline-flex items-center rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                            >
                              {t('hmDash.getPoints', { points: POINTS_PER_EXTRA })}
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void handleRedeemExtra(r.id, r.title)}
                              disabled={busy}
                            >
                              {redeemingRoleId === r.id ? t('hmDash.redeeming') : t('hmDash.usePoints', { points: POINTS_PER_EXTRA })}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => void handleUnlockExtra(r.id)}
                            disabled={busy}
                          >
                            {unlockingRoleId === r.id ? t('hmDash.startingPayment') : t('hmDash.unlockRm')}
                          </Button>
                        </div>
                      </div>
                      {insufficientPoints && (
                        <div className="mt-2 text-xs text-ink-500">
                          {t('hmDash.insufficientPoints', { have: pointsBalance ?? 0, need: POINTS_PER_EXTRA })}{' '}
                          <Link to="/points" className="font-medium text-brand-700 hover:underline">{t('hmDash.walletPage')}</Link>.
                        </div>
                      )}
                      {unlockMsg && unlockMsg.roleId === r.id && (
                        <div className={`mt-2 text-xs ${unlockMsg.tone === 'green' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {unlockMsg.text}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        </Card>
      )}

      {showAddDobModal && hmId && session && (
        <AddHmDobModal
          hmId={hmId}
          profileId={session.user.id}
          onSaved={() => { setShowAddDobModal(false); setHmHasDob(true) }}
          onCancel={() => setShowAddDobModal(false)}
        />
      )}
    </div>
  )
}

function CandidateCard({
  row, rounds, pendingProposal, preview, contact, actionBusy, schedulingFor,
  companyVerified, companyId,
  onInvite, onDecline,
  onScheduleRound, onCancelProposal, onCompleteInterviews, onMakeOffer, onMarkHired, onCancel, onRevealContact,
  onViewResume,
  feedbackEntry, onFeedbackChange, onFeedbackSubmit,
}: {
  row: CandidateRow
  rounds: InterviewRound[]
  pendingProposal: InterviewProposal | null
  preview: ProfilePreview | null
  contact: ContactInfo | null | undefined
  actionBusy: string | null
  schedulingFor: string | null
  companyVerified: boolean | null
  companyId: string | null
  onInvite: () => void
  onDecline: () => void
  onScheduleRound: () => void
  onCancelProposal: (proposalId: string) => void
  onCompleteInterviews: () => void
  onMakeOffer: () => void
  onMarkHired: () => void
  onCancel: () => void
  onRevealContact: () => void
  onViewResume: () => void
  feedbackEntry: { rating: number; hired: boolean; notes: string; outcome: string; freeText: string; saving: boolean; saved: boolean; pointsAwarded?: number }
  onFeedbackChange: (patch: Partial<{ rating: number; hired: boolean; notes: string; outcome: string; freeText: string }>) => void
  onFeedbackSubmit: () => void
}) {
  const { t } = useTranslation()
  // Company gate: invites + scheduling + offers + résumé reveal all require a
  // verified company (companies.verified=true). Treat null as "still loading"
  // so we don't briefly flash buttons as disabled.
  const companyLocked = companyVerified === false
  const lockTitle = companyLocked
    ? t('hmDash.cardLockTitle')
    : undefined
  const verifyHref = companyId ? `/onboarding/company/verify?company=${companyId}` : null
  // Real name + photo when the talent has opted into public (or whitelist-matched) visibility;
  // otherwise fall back to the anonymized handle. The preview RPC enforces the policy server-side.
  const realName = preview?.display_name ?? null
  const photoUrl = preview?.photo_url ?? null
  const displayName = realName
    ?? (row.talents?.privacy_mode === 'anonymous'
      ? t('hmDash.anonymousCandidate')
      : t('hmDash.candidate'))

  const topTags = Object.entries(row.talents?.derived_tags ?? {})
    .filter(([tag, score]) => !/^\d+$/.test(tag) && typeof score === 'number' && !isNaN(score) && score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  const pct = Math.round(row.compatibility_score ?? 0)
  const tone = pct >= 75 ? 'green' : pct >= 50 ? 'amber' : 'gray'
  const busy = (suffix: string) => actionBusy === `${row.id}:${suffix}`

  const isUrgent = row.is_urgent === true

  return (
    <Card hoverable className={`animate-slide-up ${isUrgent ? 'ring-2 ring-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.15)]' : ''}`}>
      <div className="p-6">
        {isUrgent && (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
            {t('hmDash.urgentMatchBadge')}
          </div>
        )}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={displayName}
                loading="lazy"
                decoding="async"
                className="w-14 h-14 rounded-full object-cover border border-ink-100 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center text-base font-medium shrink-0">
                {(realName ?? '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-display text-lg text-ink-900 mb-0.5 truncate">{displayName}</h3>
              <p className="text-sm text-ink-500">{t('hmDash.forRole', { role: row.roles?.title ?? t('hmDash.roleFallback') })}</p>
            </div>
          </div>
          <Badge tone={tone}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="4" /></svg>
            {t('hmDash.pctMatch', { pct })}
          </Badge>
        </div>

        {/* Résumé reveal — promoted to the top of the card so HMs find it
            without scrolling past the long match-reasoning blocks below. */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button
            onClick={onViewResume}
            size="sm"
            loading={actionBusy === `${row.id}:resume`}
            disabled={actionBusy !== null || companyLocked}
            title={companyLocked ? lockTitle : undefined}
          >
            {t('hmDash.viewResume')}
          </Button>
          {companyLocked && verifyHref && (
            <a href={verifyHref} target="_blank" rel="noreferrer" className="text-xs text-amber-700 underline">
              {t('hmDash.lockedVerifyFirst')}
            </a>
          )}
        </div>

        <div className="bg-ink-50 rounded-lg p-3 mb-4 text-sm">
          <div className="text-xs text-ink-500 uppercase tracking-wide mb-0.5">{t('hmDash.expects')}</div>
          <div className="text-ink-900 font-medium">
            RM {fmt(row.talents?.expected_salary_min)} – {fmt(row.talents?.expected_salary_max)}
            <span className="text-ink-400 font-normal"> {t('hmDash.perMonth')}</span>
          </div>
        </div>

        {topTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {topTags.map(([tag, score]) => (
              <span key={tag} className="text-xs bg-ink-100 text-ink-700 px-2 py-1 rounded-md">
                <span className="font-medium">{tag.replace(/_/g, ' ')}</span>
                <span className="text-ink-400 ml-1">{Math.round(score * 100)}</span>
              </span>
            ))}
          </div>
        )}

        <StatusNote status={row.status} />

        {row.application_summary && (
          <div className="mt-3 mb-3 border border-brand-100 rounded-lg p-3 bg-brand-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">{t('hmDash.whyHire')}</p>
            <p className="text-sm text-ink-800 leading-relaxed whitespace-pre-line">{row.application_summary}</p>
          </div>
        )}

        <MatchExplain reasoning={row.public_reasoning} />
        {row.public_reasoning?.culture_comparison && (
          <CultureCompare comparison={row.public_reasoning.culture_comparison} />
        )}
        <ScreeningChecklist
          reasoning={row.public_reasoning}
          salaryMin={row.talents?.expected_salary_min ?? null}
          salaryMax={row.talents?.expected_salary_max ?? null}
        />

        {/* Pending interview proposal — awaiting talent to pick a slot */}
        {pendingProposal && (
          <div className="mt-4 border border-amber-200 rounded-lg overflow-hidden bg-amber-50/40">
            <div className="bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 uppercase tracking-wide flex items-center justify-between gap-2">
              <span>{t('hmDash.awaitingConfirmation', { round: pendingProposal.round_number })}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={actionBusy !== null}
                loading={actionBusy === `${row.id}:cancel_interview_proposal`}
                onClick={() => onCancelProposal(pendingProposal.id)}
              >
                {t('hmDash.withdraw')}
              </Button>
            </div>
            <ul className="px-3 py-2 text-xs text-ink-700 space-y-1">
              {[pendingProposal.slot_1_at, pendingProposal.slot_2_at, pendingProposal.slot_3_at].map((at, i) => (
                <li key={i}>
                  <span className="text-ink-400 mr-2">{t('hmDash.slot', { n: i + 1 })}</span>
                  {new Date(at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })} MYT
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Interview rounds panel */}
        {rounds.length > 0 && (
          <div className="mt-4 border border-ink-100 rounded-lg overflow-hidden">
            <div className="bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-600 uppercase tracking-wide">
              {t('hmDash.interviewRounds')}
            </div>
            {rounds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-y-1 px-3 py-2 border-t border-ink-100 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-ink-900">{t('hmDash.round', { n: r.round_number })}</span>
                  <span className="text-xs text-ink-400 ml-2">
                    {new Date(r.scheduled_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })} MYT
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoundBadge status={r.status} />
                  {r.status === 'scheduled' && (
                    <a
                      href={r.interview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-600 hover:text-brand-700 underline"
                    >
                      {t('hmDash.join')}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contact reveal — available once offer is made */}
        {['offer_made', 'hired'].includes(row.status) && (
          <div className="mt-4 border border-emerald-200 rounded-lg p-3 bg-emerald-50">
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-2">{t('hmDash.contactDetails')}</p>
            {contact === undefined ? (
              <Button
                size="sm"
                onClick={onRevealContact}
                disabled={companyLocked}
                title={companyLocked ? lockTitle : undefined}
              >
                {t('hmDash.revealContact')}
              </Button>
            ) : contact === null ? (
              <p className="text-xs text-red-600">{t('hmDash.contactLoadFailed')}</p>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-ink-900">{contact.full_name}</p>
                <p className="text-ink-700">{contact.email}</p>
                {contact.phone && <p className="text-ink-700">{contact.phone}</p>}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {/* Stage 1: new candidates */}
          {['generated', 'viewed', 'accepted_by_talent'].includes(row.status) && (
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={onInvite}
                size="sm"
                loading={actionBusy === `${row.id}:invite`}
                disabled={actionBusy !== null || companyLocked}
                title={companyLocked ? lockTitle : undefined}
              >
                {t('hmDash.inviteToInterview')}
              </Button>
              <Button
                onClick={onDecline}
                size="sm"
                variant="secondary"
                loading={actionBusy === `${row.id}:decline`}
                disabled={actionBusy !== null}
              >
                {t('hmDash.decline')}
              </Button>
            </div>
          )}

          {/* Stage 2: invited / scheduling */}
          {['invited_by_manager', 'hr_scheduling', 'interview_scheduled'].includes(row.status) && (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={onScheduleRound}
                disabled={schedulingFor === row.id || actionBusy !== null || !!pendingProposal || companyLocked}
                title={companyLocked ? lockTitle : (pendingProposal ? t('hmDash.withdrawFirstHint') : undefined)}
              >
                {rounds.length === 0 ? t('hmDash.proposeInterviewTimes') : t('hmDash.proposeNextRound')}
              </Button>
              {row.status === 'interview_scheduled' && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy('complete_interviews')}
                  disabled={actionBusy !== null}
                  onClick={onCompleteInterviews}
                >
                  {t('hmDash.markAllDone')}
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                loading={busy('cancel_match')}
                disabled={actionBusy !== null}
                onClick={onCancel}
              >
                {t('hmDash.cancel')}
              </Button>
            </div>
          )}

          {/* Stage 3: interview done */}
          {row.status === 'interview_completed' && (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                loading={busy('make_offer')}
                disabled={actionBusy !== null || companyLocked}
                title={companyLocked ? lockTitle : undefined}
                onClick={onMakeOffer}
              >
                {t('hmDash.makeOffer')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy('cancel_match')}
                disabled={actionBusy !== null}
                onClick={onCancel}
              >
                {t('hmDash.declineCandidate')}
              </Button>
            </div>
          )}

          {/* Stage 4: offer out */}
          {row.status === 'offer_made' && (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                loading={busy('mark_hired')}
                disabled={actionBusy !== null || companyLocked}
                title={companyLocked ? lockTitle : undefined}
                onClick={onMarkHired}
              >
                {t('hmDash.confirmHired')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy('cancel_match')}
                disabled={actionBusy !== null}
                onClick={onCancel}
              >
                {t('hmDash.cancelOffer')}
              </Button>
            </div>
          )}

          {/* Feedback widget */}
          {['interview_completed', 'offer_made', 'hired', 'declined_by_manager', 'declined_by_talent'].includes(row.status) && (
            <div className="border border-ink-200 rounded-lg p-3 space-y-2 bg-ink-50">
              <p className="text-xs font-semibold text-ink-700 uppercase tracking-wide">
                {t('hmDash.rateThisMatch')}
              </p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => onFeedbackChange({ rating: star })}
                    className={`text-xl leading-none transition-colors ${feedbackEntry.rating >= star ? 'text-amber-400' : 'text-ink-200 hover:text-amber-300'}`}
                    aria-label={t('hmDash.starAria', { count: star })}
                  >
                    ★
                  </button>
                ))}
                {feedbackEntry.rating > 0 && (
                  <span className="ml-2 text-xs text-ink-500">
                    {['', t('hmDash.ratingPoor'), t('hmDash.ratingBelowAverage'), t('hmDash.ratingAverage'), t('hmDash.ratingGood'), t('hmDash.ratingExcellent')][feedbackEntry.rating]}
                  </span>
                )}
              </div>
              <select
                value={feedbackEntry.outcome}
                onChange={(e) => onFeedbackChange({ outcome: e.target.value })}
                className="w-full border border-ink-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
              >
                {hmOutcomes(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <textarea
                value={feedbackEntry.freeText}
                onChange={(e) => onFeedbackChange({ freeText: e.target.value })}
                placeholder={t('hmDash.feedbackPlaceholder')}
                rows={2}
                className="w-full border border-ink-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white resize-none"
              />
              {feedbackEntry.saved ? (
                <p className="text-xs text-emerald-600 font-medium">
                  {feedbackEntry.pointsAwarded ? t('hmDash.feedbackSavedPoints', { points: feedbackEntry.pointsAwarded }) : t('hmDash.feedbackSavedHelps')}
                </p>
              ) : (
                <Button
                  size="sm"
                  onClick={onFeedbackSubmit}
                  disabled={feedbackEntry.rating === 0 || feedbackEntry.saving}
                  loading={feedbackEntry.saving}
                >
                  {t('hmDash.saveFeedback')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function RoundBadge({ status }: { status: InterviewRound['status'] }) {
  const { t } = useTranslation()
  const m = {
    scheduled:  { label: t('hmDash.roundScheduled'), tone: 'brand' as const },
    completed:  { label: t('hmDash.roundDone'),      tone: 'green' as const },
    cancelled:  { label: t('hmDash.roundCancelled'), tone: 'gray' as const },
    no_show:    { label: t('hmDash.roundNoShow'),    tone: 'amber' as const },
  }
  const { label, tone } = m[status] ?? { label: status, tone: 'gray' as const }
  return <Badge tone={tone}>{label}</Badge>
}

function StatusNote({ status }: { status: string }) {
  const { t } = useTranslation()
  const m: Record<string, { label: string; tone: 'gray' | 'brand' | 'green' | 'amber' | 'red' }> = {
    generated:            { label: t('hmDash.statusGenerated'),           tone: 'brand' },
    viewed:               { label: t('hmDash.statusViewed'),              tone: 'gray' },
    accepted_by_talent:   { label: t('hmDash.statusAcceptedByTalent'),    tone: 'green' },
    invited_by_manager:   { label: t('hmDash.statusInvited'),             tone: 'brand' },
    hr_scheduling:        { label: t('hmDash.statusHrScheduling'),        tone: 'amber' },
    interview_scheduled:  { label: t('hmDash.statusInterviewScheduled'),  tone: 'brand' },
    interview_completed:  { label: t('hmDash.statusInterviewCompleted'),  tone: 'amber' },
    offer_made:           { label: t('hmDash.statusOfferMade'),           tone: 'amber' },
    hired:                { label: t('hmDash.statusHired'),               tone: 'green' },
    cancelled:            { label: t('hmDash.statusCancelled'),           tone: 'gray' },
    no_show:              { label: t('hmDash.statusNoShow'),              tone: 'red' },
  }
  const entry = m[status] ?? { label: status.replace(/_/g, ' '), tone: 'gray' as const }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

function CultureCompare({ comparison }: { comparison: CultureComparison }) {
  const { t } = useTranslation()
  if (comparison.talent_top_wants.length === 0 && comparison.hm_top_offers.length === 0) return null
  return (
    <div className="mt-3 border border-ink-100 rounded-lg p-3 bg-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-2">{t('hmDash.cultureAlignment')}</p>
      <div className="flex flex-wrap gap-1.5">
        {comparison.overlap.map((k) => (
          <span key={k} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
            ✓ {comparison.labels[k] ?? k.replace('wants_', '')}
          </span>
        ))}
        {comparison.talent_only.map((k) => (
          <span key={k} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
            ~ {comparison.labels[k] ?? k.replace('wants_', '')}
          </span>
        ))}
      </div>
      {(comparison.overlap.length > 0 || comparison.talent_only.length > 0) && (
        <p className="text-xs text-ink-400 mt-1.5">
          {comparison.overlap.length > 0 && <span className="mr-3">{t('hmDash.cultureAligned')}</span>}
          {comparison.talent_only.length > 0 && <span>{t('hmDash.cultureTalentWants')}</span>}
        </p>
      )}
    </div>
  )
}

function EmployerReputationPanel({ reputation }: {
  reputation: { reputation_score: number | null; feedback_volume: number; phs_offer_accept_rate: number | null; hm_quality_factor: number | null; hm_cancel_rate: number | null }
}) {
  const { t } = useTranslation()
  const score = reputation.reputation_score
  const scoreTone = score == null ? 'gray' : score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red'
  const qf = reputation.hm_quality_factor
  const qfTone = qf == null ? 'gray' : qf >= 0.90 ? 'green' : qf >= 0.80 ? 'amber' : 'red'
  return (
    <Card className="mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-0.5">{t('hmDash.reputationTitle')}</p>
            <p className="text-xs text-ink-400">{t('hmDash.reputationBasedOn', { count: reputation.feedback_volume })}</p>
          </div>
          {score != null && <Badge tone={scoreTone as 'gray' | 'green' | 'amber' | 'brand' | 'accent' | 'red'}>{t('hmDash.scoreOutOf100', { score: Math.round(score) })}</Badge>}
        </div>
        <div className="flex gap-6 flex-wrap">
          {qf != null && (
            <div>
              <p className="text-xs text-ink-500">{t('hmDash.reliabilityScore')}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-ink-900">{t('hmDash.scoreOutOf100', { score: (qf * 100).toFixed(0) })}</p>
                <Badge tone={qfTone as 'gray' | 'green' | 'amber' | 'brand' | 'accent' | 'red'} className="text-xs">
                  {qf >= 0.90 ? t('hmDash.reliabilityExcellent') : qf >= 0.80 ? t('hmDash.reliabilityGood') : t('hmDash.reliabilityNeedsAttention')}
                </Badge>
              </div>
              <p className="text-xs text-ink-400 mt-0.5">{t('hmDash.reliabilityFactors')}</p>
            </div>
          )}
          {reputation.hm_cancel_rate != null && (
            <div>
              <p className="text-xs text-ink-500">{t('hmDash.cancelRate')}</p>
              <p className="text-sm font-semibold text-ink-900">{Math.round(reputation.hm_cancel_rate * 100)}%</p>
            </div>
          )}
          {reputation.phs_offer_accept_rate != null && (
            <div>
              <p className="text-xs text-ink-500">{t('hmDash.offerAcceptRate')}</p>
              <p className="text-sm font-semibold text-ink-900">{Math.round(reputation.phs_offer_accept_rate * 100)}%</p>
            </div>
          )}
        </div>
        {qf != null && qf < 0.80 && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            {t('hmDash.reliabilityImproveHint')}
          </div>
        )}
      </div>
    </Card>
  )
}
