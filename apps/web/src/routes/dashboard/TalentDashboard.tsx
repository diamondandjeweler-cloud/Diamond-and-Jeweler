import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { fmt } from '../../lib/format'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'
import { useSeo } from '../../lib/useSeo'
import { getDisplayName } from '../../lib/displayName'
import { readDashCache, writeDashCache } from '../../lib/dashboardCache'
import Skeleton from '../../components/Skeleton'
import { SkeletonCard } from '../../components/Skeleton'
import { Button, Card, Badge, Alert, EmptyState, PageHeader, Stat } from '../../components/ui'
import MatchExplain from '../../components/MatchExplain'
import CareerNudgePanel from '../../components/CareerNudgePanel'
import GrowthNudgePreferences from '../../components/GrowthNudgePreferences'
import type { PublicReasoning } from '../../types/db'
import { usePushSubscription } from '../../lib/usePushSubscription'

/** Cached snapshot — counts only. The full match details (scores, IDs) are
 *  refetched fresh every visit to keep PDPA exposure surface minimal. */
interface TalentCacheSnapshot {
  matchesCount: number
  openCount: number
  inFlightCount: number
}

interface MatchRow {
  id: string
  compatibility_score: number | null
  status: string
  expires_at: string | null
  public_reasoning: PublicReasoning | null
  application_summary: string | null
  roles: { id: string; title: string; description: string | null; salary_min: number | null; salary_max: number | null; location: string | null; work_arrangement: string | null; employment_type?: string; hourly_rate?: number | null; duration_days?: number | null } | null
}

interface InterviewRound {
  id: string
  round_number: number
  scheduled_at: string
  interview_url: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
}

interface InterviewProposal {
  id: string
  match_id: string
  round_number: number
  slot_1_at: string
  slot_2_at: string
  slot_3_at: string
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
  picked_slot: number | null
  created_at: string
}

const ACTIVE = [
  'generated', 'viewed', 'accepted_by_talent',
  'invited_by_manager', 'hr_scheduling',
  'interview_scheduled', 'interview_completed',
  'offer_made',
]

const TALENT_OUTCOME_KEYS: { value: string; emoji: string; tKey: string }[] = [
  { value: '',                  emoji: '',    tKey: 'talentDash.outcomeSelect' },
  { value: 'accepted_offer',    emoji: '✅ ', tKey: 'talentDash.outcomeAccepted' },
  { value: 'offer_declined',    emoji: '❌ ', tKey: 'talentDash.outcomeDeclined' },
  { value: 'company_ghosted',   emoji: '👻 ', tKey: 'talentDash.outcomeGhosted' },
  { value: 'passed_probation',  emoji: '🏆 ', tKey: 'talentDash.outcomePassedProbation' },
  { value: 'failed_probation',  emoji: '⚠️ ', tKey: 'talentDash.outcomeFailedProbation' },
  { value: 'still_employed_6m', emoji: '📅 ', tKey: 'talentDash.outcomeEmployed6m' },
  { value: 'still_employed_1y', emoji: '🎉 ', tKey: 'talentDash.outcomeEmployed1y' },
]

export default function TalentDashboard() {
  const { t } = useTranslation()
  useSeo({ title: t('talentDash.seoTitle'), noindex: true })
  const { session, profile } = useSession()
  const push = usePushSubscription()
  const location = useLocation()
  const navigate = useNavigate()
  // Cached counts hydrate the KPI strip instantly. `matches` itself remains
  // null until fresh data arrives, but the headline numbers don't shimmer.
  const cachedSnap = useState(() => readDashCache<TalentCacheSnapshot>('talent_dashboard', session?.user.id))[0]
  const [matches, setMatches] = useState<MatchRow[] | null>(null)
  // `loading` state was previously gating the whole render via early-return
  // spinner. With the shell-always-rendered refactor, the boolean was unused
  // and removed. setMatches/setErr re-renders are still triggered by the load
  // effect's normal flow.
  const setLoading = (_v: boolean) => { /* deprecated no-op; kept to minimise diff */ }
  const [err, setErr] = useState<string | null>(null)
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null)
  const [showJustSavedModal, setShowJustSavedModal] = useState<boolean>(
    Boolean((location.state as { extractionPending?: boolean } | null)?.extractionPending),
  )
  const [extraUsed, setExtraUsed] = useState(0)
  const [unlocking, setUnlocking] = useState(false)
  const [redeemingExtra, setRedeemingExtra] = useState(false)
  const [unlockMsg, setUnlockMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)
  const POINTS_PER_EXTRA = 21
  const [urgentBusy, setUrgentBusy] = useState(false)
  const [urgentResult, setUrgentResult] = useState<{
    role: { id: string; title: string; description: string | null; salary_min: number | null; salary_max: number | null; location: string | null; work_arrangement: string | null }
  } | null>(null)
  const [urgentMsg, setUrgentMsg] = useState<{ tone: 'green' | 'amber' | 'red'; text: React.ReactNode } | null>(null)
  const [pointsBalance, setPointsBalance] = useState<number | null>(null)
  const URGENT_COST = 9
  const [profileExpiresAt, setProfileExpiresAt] = useState<string | null>(null)
  const [reviving, setReviving] = useState(false)
  const [reviveStep, setReviveStep] = useState<'idle' | 'confirm'>('idle')
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (reloadTimerRef.current !== null) clearTimeout(reloadTimerRef.current) }, [])
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])
  const [talentReputation, setTalentReputation] = useState<{ reputation_score: number | null; feedback_volume: number; phs_show_rate: number | null; phs_accept_rate: number | null } | null>(null)
  const [profileGaps, setProfileGaps] = useState<string[]>([])
  const [talentFeedbackState, setTalentFeedbackState] = useState<Record<string, { rating: number; outcome: string; freeText: string; saving: boolean; saved: boolean; pointsAwarded?: number }>>({})

  // Interview flow state
  const [roundsByMatch, setRoundsByMatch] = useState<Record<string, InterviewRound[]>>({})
  const [proposalsByMatch, setProposalsByMatch] = useState<Record<string, InterviewProposal[]>>({})
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const loadRounds = useCallback(async (matchIds: string[]) => {
    if (matchIds.length === 0) return
    const { data, error } = await supabase
      .from('interview_rounds')
      .select('id, match_id, round_number, scheduled_at, interview_url, status')
      .in('match_id', matchIds)
      .order('round_number', { ascending: true })
    if (!mountedRef.current) return
    if (error) { setErr(error.message); return }
    if (!data) return
    const grouped: Record<string, InterviewRound[]> = {}
    for (const r of data) {
      if (!grouped[r.match_id]) grouped[r.match_id] = []
      grouped[r.match_id].push(r as InterviewRound)
    }
    setRoundsByMatch((prev) => ({ ...prev, ...grouped }))
  }, [mountedRef])

  const loadProposals = useCallback(async (matchIds: string[]) => {
    if (matchIds.length === 0) return
    const { data, error } = await supabase
      .from('interview_proposals')
      .select('id, match_id, round_number, slot_1_at, slot_2_at, slot_3_at, status, picked_slot, created_at')
      .in('match_id', matchIds)
      .order('created_at', { ascending: false })
    if (!mountedRef.current) return
    if (error) { setErr(error.message); return }
    if (!data) return
    const grouped: Record<string, InterviewProposal[]> = {}
    for (const p of data) {
      if (!grouped[p.match_id]) grouped[p.match_id] = []
      grouped[p.match_id].push(p as InterviewProposal)
    }
    setProposalsByMatch((prev) => ({ ...prev, ...grouped }))
  }, [mountedRef])

  // Key on user.id, not the session object. supabase-js mints a fresh session
  // object on every TOKEN_REFRESHED event (~hourly), and the old [session] dep
  // tore down the in-flight load each time — cancelled=true short-circuited
  // setLoading(false) and trapped the page on "Sedang memuat…" after routine
  // SPA navigations.
  const userId = session?.user.id
  useEffect(() => {
    let cancelled = false
    let talentId: string | null = null

    async function load() {
      if (!userId) {
        // No session yet — materialize an empty matches array so the page
        // settles instead of shimmering skeletons indefinitely. The effect
        // re-fires when userId arrives.
        if (!cancelled) setMatches([])
        setLoading(false); return
      }
      try {
        // Phase 1 — fire all session-only queries in parallel. Previously these
        // ran sequentially, costing ~3× the network RTT on dashboard mount.
        const [{ data: talent }, { data: pointsRow }, { data: lastUrgent }] = await Promise.all([
          supabase.from('talents').select('id, extra_matches_used, profile_expires_at, reputation_score, feedback_volume, phs_show_rate, phs_accept_rate, current_employment_status, current_salary, notice_period_days, education_level, has_management_experience, work_authorization, preferred_management_style, expected_salary_min, expected_salary_max, employment_type_preferences, location_matters, career_goal_horizon, job_intention, has_noncompete, salary_structure_preference, role_scope_preference, reason_for_leaving_category, extraction_status').eq('profile_id', userId).maybeSingle(),
          supabase.from('profiles').select('points').eq('id', userId).maybeSingle(),
          supabase
            .from('urgent_priority_requests')
            .select('id, result_id, completed_at')
            .eq('user_id', userId)
            .eq('request_type', 'find_job')
            .eq('status', 'completed')
            .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
            .order('completed_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        if (cancelled) return
        if (!talent) {
          // User has a profile but no talents row yet (mid-onboarding, or test
          // account without seed data). Settle the matches slot to empty so the
          // KPI numbers + offer-card area show their EmptyState instead of
          // shimmering skeletons forever.
          setMatches([])
          writeDashCache<TalentCacheSnapshot>('talent_dashboard', userId, {
            matchesCount: 0, openCount: 0, inFlightCount: 0,
          })
          return
        }
        if (cancelled) return
        setExtractionStatus((talent as unknown as { extraction_status: string | null }).extraction_status ?? 'complete')
        talentId = talent.id
        setExtraUsed(talent.extra_matches_used ?? 0)
        if (!cancelled) setPointsBalance(pointsRow?.points ?? 0)
        setProfileExpiresAt((talent as unknown as { profile_expires_at: string | null }).profile_expires_at ?? null)
        setTalentReputation({
          reputation_score: (talent as unknown as { reputation_score: number | null }).reputation_score ?? null,
          feedback_volume: (talent as unknown as { feedback_volume: number }).feedback_volume ?? 0,
          phs_show_rate: (talent as unknown as { phs_show_rate: number | null }).phs_show_rate ?? null,
          phs_accept_rate: (talent as unknown as { phs_accept_rate: number | null }).phs_accept_rate ?? null,
        })
        const t2 = talent as unknown as Record<string, unknown>
        // Push i18n keys (not raw English) — ProfileCompletenessBar runs each
        // through t() so the chips localise.
        const gaps: string[] = []
        if (!t2.current_employment_status)                gaps.push('talentDash.gapEmploymentStatus')
        if (t2.current_salary == null)                    gaps.push('talentDash.gapCurrentSalary')
        if (!t2.education_level)                          gaps.push('talentDash.gapEducationLevel')
        if (!t2.work_authorization)                       gaps.push('talentDash.gapWorkAuthorization')
        if (t2.expected_salary_min == null)               gaps.push('talentDash.gapExpectedSalary')
        if (!Array.isArray(t2.employment_type_preferences) || (t2.employment_type_preferences as unknown[]).length === 0)
                                                          gaps.push('talentDash.gapEmploymentType')
        if (!t2.preferred_management_style)               gaps.push('talentDash.gapManagementStyle')
        if (!t2.career_goal_horizon)                      gaps.push('talentDash.gapCareerGoal')
        if (!t2.job_intention)                            gaps.push('talentDash.gapLongTermIntention')
        if (t2.has_noncompete == null)                    gaps.push('talentDash.gapNonCompete')
        if (!t2.salary_structure_preference)              gaps.push('talentDash.gapSalaryStructure')
        if (t2.notice_period_days == null)                gaps.push('talentDash.gapNoticePeriod')
        if (!cancelled) setProfileGaps(gaps)

        // Phase 2 — matches (needs talent.id) and the urgent role (needs
        // lastUrgent.result_id, conditional) fire in parallel.
        // Rehydrates the most recent successful urgent job result so it survives
        // page reload (BUG 5 fix). Only for find_job requests, last 24h, with
        // a result_id that still points at an active role.
        const urgentRolePromise = lastUrgent?.result_id
          ? supabase.from('roles')
              .select('id, title, description, salary_min, salary_max, location, work_arrangement, status')
              .eq('id', lastUrgent.result_id)
              .maybeSingle()
          : Promise.resolve({ data: null })

        const [{ data, error }, urgentRoleRes] = await Promise.all([
          supabase
            .from('matches')
            .select('id, compatibility_score, status, expires_at, public_reasoning, application_summary, roles(id, title, description, salary_min, salary_max, location, work_arrangement, employment_type, hourly_rate, duration_days)')
            .eq('talent_id', talent.id)
            .in('status', ACTIVE)
            .order('created_at', { ascending: false }),
          urgentRolePromise,
        ])
        if (cancelled) return

        const urgentRole = (urgentRoleRes as { data: { id: string; title: string; description: string | null; salary_min: number | null; salary_max: number | null; location: string | null; work_arrangement: string | null; status: string } | null }).data
        if (urgentRole && urgentRole.status === 'active') {
          setUrgentResult({ role: urgentRole })
        }

        if (error) setErr(error.message)
        else {
          const rows = (data ?? []) as unknown as MatchRow[]
          setMatches(rows)
          // Cache safe-to-show counts so the KPI strip is instant on return.
          // We never cache match IDs / scores / role details — those refetch.
          const openCount = rows.filter((m) => ['generated', 'viewed'].includes(m.status)).length
          const inFlightCount = rows.filter((m) => !['generated', 'viewed'].includes(m.status)).length
          writeDashCache<TalentCacheSnapshot>('talent_dashboard', userId, {
            matchesCount: rows.length,
            openCount,
            inFlightCount,
          })
          const interviewMatchIds = rows
            .filter((r) => ['invited_by_manager', 'interview_scheduled', 'interview_completed', 'offer_made'].includes(r.status))
            .map((r) => r.id)
          await Promise.all([
            loadRounds(interviewMatchIds),
            loadProposals(interviewMatchIds),
          ])
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : t('talentDash.errLoadOffers'))
          // Failed load — settle the skeletons so the user sees the error banner
          // and the empty state instead of indefinite shimmer. The error banner
          // already explains the situation; nullable arrays would just trap.
          setMatches((cur) => cur ?? [])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    // Subscribe AFTER load() resolves so talentId is known and we can set a
    // server-side filter — avoids broadcasting all matches rows to every user.
    let channel: ReturnType<typeof supabase.channel> | null = null
    void load().then(() => {
      if (cancelled || !talentId) return
      channel = supabase
        .channel(`talent-matches-${userId ?? 'anon'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `talent_id=eq.${talentId}` }, (payload) => {
          const next = payload.new as MatchRow & { talent_id?: string } | null
          const prev = payload.old as MatchRow & { talent_id?: string } | null
          if (next?.talent_id !== talentId && prev?.talent_id !== talentId) return
          setMatches((xs) => {
            const cur = xs ?? []
            if (payload.eventType === 'DELETE') return cur.filter((m) => m.id !== prev?.id)
            if (payload.eventType === 'INSERT' && next) return [next, ...cur]
            if (payload.eventType === 'UPDATE' && next) return cur.map((m) => (m.id === next.id ? { ...m, ...next } : m))
            return cur
          })
          // Clear saved feedback when match status changes so the submit button
          // can reappear if the user wants to leave a fresh rating for the new stage.
          if (payload.eventType === 'UPDATE' && next?.id) {
            setTalentFeedbackState((s) => {
              const entry = s[next.id]
              if (!entry?.saved) return s  // only reset if feedback was already saved
              const copy = { ...s }
              delete copy[next.id]
              return copy
            })
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interview_rounds' }, (payload) => {
          const round = payload.new as InterviewRound & { match_id: string }
          // Only apply if this round belongs to one of our matches (client-side guard;
          // Supabase Realtime does not support `in` filters so we filter here)
          setRoundsByMatch((prev) => {
            if (!(round.match_id in prev) && !Object.keys(prev).includes(round.match_id)) return prev
            const existing = prev[round.match_id] ?? []
            return { ...prev, [round.match_id]: [...existing, round] }
          })
        })
        .subscribe()
    })

    return () => { cancelled = true; if (channel) void supabase.removeChannel(channel) }
  }, [userId, loadRounds, loadProposals, t])

  // Poll the talents row while extraction is in flight so the banner clears
  // and matches start flowing once the worker finishes. Stops on terminal state.
  useEffect(() => {
    if (!userId) return
    if (extractionStatus !== 'pending' && extractionStatus !== 'processing') return
    let cancelled = false
    const tick = async () => {
      const { data } = await supabase
        .from('talents')
        .select('extraction_status')
        .eq('profile_id', userId)
        .maybeSingle()
      if (cancelled) return
      const next = (data as { extraction_status: string | null } | null)?.extraction_status ?? null
      if (next && next !== extractionStatus) setExtractionStatus(next)
    }
    const id = window.setInterval(() => { void tick() }, 10_000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [userId, extractionStatus])

  // Drop the one-shot navigation state so a refresh won't re-show the modal.
  useEffect(() => {
    if (!showJustSavedModal) return
    if ((location.state as { extractionPending?: boolean } | null)?.extractionPending) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [showJustSavedModal, location.pathname, location.state, navigate])

  async function reviveProfile() {
    if (!session) return
    setReviving(true); setErr(null)
    try {
      const { data: talentRow } = await supabase.from('talents').select('id').eq('profile_id', session.user.id).maybeSingle()
      if (!mountedRef.current) return
      if (!talentRow) return
      const newExpiry = new Date(Date.now() + 45 * 86400000).toISOString()
      const { error } = await supabase.from('talents').update({
        profile_expires_at: newExpiry,
        is_open_to_offers: true,
        ghost_score: 0,
      }).eq('id', talentRow.id)
      if (!mountedRef.current) return
      if (error) throw error
      setProfileExpiresAt(newExpiry)
      setReviveStep('idle')
    } catch (e) {
      if (!mountedRef.current) return
      setErr(e instanceof Error ? e.message : t('talentDash.errReviveProfile'))
    } finally {
      if (mountedRef.current) setReviving(false)
    }
  }

  async function handleUnlockExtra() {
    setErr(null); setUnlockMsg(null); setUnlocking(true)
    try {
      const res = await callFunction<{ paymentUrl: string }>('unlock-extra-match', { match_type: 'talent_extra' })
      if (res?.paymentUrl) window.location.href = res.paymentUrl
      else setUnlockMsg({ tone: 'red', text: t('talentDash.errPaymentNoUrl') })
    } catch (e) {
      console.error('[unlock-extra-match] failed', e)
      setUnlockMsg({ tone: 'red', text: e instanceof Error ? e.message : t('talentDash.errPaymentStart') })
    } finally { setUnlocking(false) }
  }

  async function handleRedeemExtraTalent() {
    setErr(null); setUnlockMsg(null)
    if (pointsBalance != null && pointsBalance < POINTS_PER_EXTRA) {
      setUnlockMsg({
        tone: 'red',
        text: t('talentDash.redeemNeedPoints', { cost: POINTS_PER_EXTRA, balance: pointsBalance }),
      })
      return
    }
    if (!window.confirm(t('talentDash.redeemConfirm', { cost: POINTS_PER_EXTRA }))) return
    setRedeemingExtra(true)
    try {
      await callFunction<{ message: string; cost: number }>('redeem-points', { target_type: 'talent' })
      if (!mountedRef.current) return
      setUnlockMsg({ tone: 'green', text: t('talentDash.redeemSuccess', { cost: POINTS_PER_EXTRA }) })
      setPointsBalance((p) => (p == null ? p : p - POINTS_PER_EXTRA))
      setExtraUsed((u) => u + 1)
      reloadTimerRef.current = setTimeout(() => { window.location.reload() }, 1500)
    } catch (e) {
      console.error('[redeem-points] failed', e)
      if (!mountedRef.current) return
      setUnlockMsg({ tone: 'red', text: e instanceof Error ? e.message : t('talentDash.errRedeemPoints') })
    } finally { if (mountedRef.current) setRedeemingExtra(false) }
  }

  async function handleUrgentJobSearch() {
    setUrgentMsg(null); setUrgentResult(null); setErr(null)
    if (pointsBalance != null && pointsBalance < URGENT_COST) {
      setUrgentMsg({
        tone: 'amber',
        text: (
          <>
            {t('talentDash.urgentNeedPoints', { cost: URGENT_COST, balance: pointsBalance })}{' '}
            <Link to="/points" className="font-semibold underline hover:text-ink-900">
              {t('talentDash.urgentBuyOrEarn')}
            </Link>
          </>
        ),
      })
      return
    }
    if (!window.confirm(t('talentDash.urgentConfirm', { cost: URGENT_COST }))) return
    setUrgentBusy(true)
    try {
      const res = await callFunction<{
        success: boolean
        cost: number
        balance_after: number
        result: { kind: 'role'; role: { id: string; title: string; description: string | null; salary_min: number | null; salary_max: number | null; location: string | null; work_arrangement: string | null } } | null
        message?: string
      }>('urgent-priority-search', { request_type: 'find_job' })
      if (!mountedRef.current) return
      if (typeof res.balance_after === 'number') setPointsBalance(res.balance_after)
      if (!res.result) {
        setUrgentMsg({ tone: 'amber', text: res.message ?? t('talentDash.urgentNoRole') })
      } else {
        setUrgentResult({ role: res.result.role })
        setUrgentMsg({
          tone: 'green',
          text: t('talentDash.urgentFound', { balance: res.balance_after }),
        })
      }
    } catch (e) {
      if (!mountedRef.current) return
      setUrgentMsg({ tone: 'red', text: e instanceof Error ? e.message : t('talentDash.urgentFailed') })
    } finally { if (mountedRef.current) setUrgentBusy(false) }
  }

  async function doAction(matchId: string, action: string) {
    setErr(null)
    setActionBusy(`${matchId}:${action}`)
    // Optimistic UI — flip the status locally before the edge function returns,
    // so the button feels instant even when the function cold-starts. On error
    // we revert to the snapshot taken below.
    const prev = matches?.find((m) => m.id === matchId) ?? null
    const optimisticStatus: Record<string, string> = {
      accept_offer: 'hired',
      decline_offer: 'cancelled',
    }
    const nextStatus = optimisticStatus[action]
    if (nextStatus) {
      setMatches((ms) => (ms ?? []).map((m) => (m.id === matchId ? { ...m, status: nextStatus } : m)))
    }
    try {
      await callFunction('interview-action', { action, match_id: matchId })
      // Reconcile in the background — realtime will pick this up too, the
      // refetch just guarantees we land on the canonical row.
      void supabase
        .from('matches')
        .select('id, compatibility_score, status, expires_at, public_reasoning, application_summary, roles(id, title, description, salary_min, salary_max, location, work_arrangement, employment_type, hourly_rate, duration_days)')
        .eq('id', matchId)
        .maybeSingle()
        .then(({ data: updated }) => {
          if (!mountedRef.current) return
          if (updated) setMatches((ms) => (ms ?? []).map((m) => (m.id === matchId ? (updated as unknown as MatchRow) : m)))
        })
    } catch (e) {
      if (!mountedRef.current) return
      if (prev) setMatches((ms) => (ms ?? []).map((m) => {
        if (m.id !== matchId) return m
        // Only revert if the status is still the optimistically-set value.
        return (nextStatus && m.status === nextStatus) ? prev : m
      }))
      setErr(e instanceof Error ? e.message : t('talentDash.errActionFailed'))
    } finally {
      if (mountedRef.current) setActionBusy(null)
    }
  }

  async function pickInterviewSlot(matchId: string, proposalId: string, slot: 1 | 2 | 3) {
    setErr(null)
    setActionBusy(`${matchId}:accept_interview_slot:${slot}`)
    try {
      await callFunction('interview-action', {
        action: 'accept_interview_slot',
        match_id: matchId,
        proposal_id: proposalId,
        picked_slot: slot,
      })
      await Promise.all([loadRounds([matchId]), loadProposals([matchId])])
      if (!mountedRef.current) return
      setMatches((ms) => (ms ?? []).map((m) => (m.id === matchId ? { ...m, status: 'interview_scheduled' } : m)))
    } catch (e) {
      if (!mountedRef.current) return
      setErr(e instanceof Error ? e.message : t('talentDash.errConfirmSlot'))
    } finally {
      if (mountedRef.current) setActionBusy(null)
    }
  }

  async function declineInterviewProposal(matchId: string, proposalId: string) {
    setErr(null)
    setActionBusy(`${matchId}:decline_interview_proposal`)
    try {
      await callFunction('interview-action', {
        action: 'decline_interview_proposal',
        match_id: matchId,
        proposal_id: proposalId,
      })
      await loadProposals([matchId])
    } catch (e) {
      if (!mountedRef.current) return
      setErr(e instanceof Error ? e.message : t('talentDash.errDeclineProposal'))
    } finally {
      if (mountedRef.current) setActionBusy(null)
    }
  }

  async function submitTalentFeedback(matchId: string) {
    const fb = talentFeedbackState[matchId]
    if (!fb || fb.rating === 0) return
    setTalentFeedbackState((s) => ({ ...s, [matchId]: { ...s[matchId], saving: true } }))
    try {
      const result = await callFunction<{ success: boolean; points_awarded: number }>('submit-feedback', {
        match_id: matchId,
        stage: 'interview',
        from_party: 'talent',
        rating: fb.rating,
        ...(fb.outcome && { outcome: fb.outcome }),
        ...(fb.freeText.trim() && { free_text: fb.freeText.trim() }),
      })
      if (!mountedRef.current) return
      setTalentFeedbackState((s) => ({
        ...s,
        [matchId]: { ...s[matchId], saving: false, saved: true, pointsAwarded: result?.points_awarded ?? 0 },
      }))
    } catch (e) {
      if (!mountedRef.current) return
      setTalentFeedbackState((s) => ({ ...s, [matchId]: { ...s[matchId], saving: false } }))
      setErr(e instanceof Error ? e.message : t('talentDash.errSaveFeedback'))
    }
  }

  async function respond(id: string, next: 'accepted_by_talent' | 'declined_by_talent') {
    setActionBusy(`${id}:${next}`)
    const current = matches?.find((m) => m.id === id)
    setMatches((ms) => (ms ?? []).map((m) => (m.id === id ? { ...m, status: next } : m)))
    try {
      const { error } = await supabase.from('matches').update({
        status: next,
        viewed_at: new Date().toISOString(),
        accepted_at: next === 'accepted_by_talent' ? new Date().toISOString() : null,
      }).eq('id', id)
      if (!mountedRef.current) return
      if (error) {
        setErr(error.message)
        setMatches((ms) => (ms ?? []).map((m) => {
          if (m.id !== id) return m
          // Only revert if the status is still the value we optimistically set;
          // a concurrent realtime UPDATE may have arrived with a newer status.
          return m.status === next ? { ...m, status: current?.status ?? 'generated' } : m
        }))
        return
      }
      const event_type = next === 'accepted_by_talent' ? 'accept_interview' : 'reject_with_reason'
      try { await callFunction('award-points', { event_type, match_id: id }) } catch { /* tolerate */ }
    } finally {
      if (mountedRef.current) setActionBusy(null)
    }
  }

  // Shell renders immediately — individual data sections handle their own
  // skeleton state. Cached counts (if any) keep the KPI strip from shimmering.
  const openCount = matches != null
    ? matches.filter((m) => ['generated', 'viewed'].includes(m.status)).length
    : cachedSnap?.openCount ?? null
  const inFlight  = matches != null
    ? matches.filter((m) => !['generated', 'viewed'].includes(m.status)).length
    : cachedSnap?.inFlightCount ?? null
  const totalActive = matches != null ? matches.length : cachedSnap?.matchesCount ?? null
  const slotsAvailable = totalActive != null ? Math.max(0, 3 - totalActive) : null

  return (
    <div>
      <PageHeader
        eyebrow={profile && t('dashboard.talentGreeting', { name: getDisplayName(profile) })}
        title={t('talentDash.pageTitle')}
        description={t('talentDash.pageDescription')}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {push.state === 'idle' && push.vapidReady && Notification.permission !== 'denied' && (
              <button
                type="button"
                onClick={() => void push.subscribe()}
                disabled={push.subscribing}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-brand-200 text-brand-700 hover:bg-brand-50 transition-colors disabled:opacity-60"
                aria-label={t('talentDash.enableNotificationsAria')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {t('talentDash.enableMatchAlerts')}
              </button>
            )}
            {push.state === 'subscribed' && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
                {t('talentDash.matchAlertsOn')}
              </span>
            )}
            {push.showIosHint && (
              <span className="text-xs text-gray-500">{t('talentDash.iosHint')}</span>
            )}
            <Link to="/talent/profile" className="btn-secondary">{t('talentDash.editProfile')}</Link>
          </div>
        }
      />

      <ExpiryBanner
        expiresAt={profileExpiresAt}
        reviving={reviving}
        reviveStep={reviveStep}
        onReviveClick={() => setReviveStep('confirm')}
        onReviveConfirm={reviveProfile}
        onReviveCancel={() => setReviveStep('idle')}
      />

      {(extractionStatus === 'pending' || extractionStatus === 'processing') && (
        <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 flex items-start gap-3">
          <svg className="animate-spin h-5 w-5 text-brand-500 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div className="text-sm text-brand-900">
            <div className="font-semibold">{t('talentDash.analysingTitle')}</div>
            <div className="text-brand-800 mt-0.5">
              {t('talentDash.analysingBody')}
            </div>
          </div>
        </div>
      )}

      {extractionStatus === 'failed' && (
        <div className="mb-6"><Alert tone="red">
          {t('talentDash.analysisFailedLead')}{' '}
          <Link to="/talent/profile" className="underline font-semibold">{t('talentDash.openYourProfile')}</Link>{' '}
          {t('talentDash.analysisFailedTail')}
        </Alert></div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat
          label={t('talentDash.statAwaiting')}
          value={openCount == null ? <Skeleton width={40} height={28} /> : openCount}
          tone={(openCount ?? 0) > 0 ? 'brand' : 'default'}
        />
        <Stat
          label={t('talentDash.statInProgress')}
          value={inFlight == null ? <Skeleton width={40} height={28} /> : inFlight}
        />
        <Stat
          label={t('talentDash.statTotalActive')}
          value={totalActive == null ? <Skeleton width={40} height={28} /> : totalActive}
        />
        <Stat
          label={t('talentDash.statSlotsAvailable')}
          value={slotsAvailable == null ? <Skeleton width={40} height={28} /> : slotsAvailable}
          hint={t('talentDash.statSlotsHint')}
        />
      </div>

      <CareerNudgePanel side="talent" />

      <GrowthNudgePreferences />

      {profileGaps.length > 0 && (
        <ProfileCompletenessBar gaps={profileGaps} />
      )}

      {talentReputation && talentReputation.feedback_volume > 0 && (
        <CareerHealthPanel reputation={talentReputation} />
      )}

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}

      {matches == null ? (
        // Pre-fetch: 2 skeleton offer cards so the layout feels populated.
        <div className="grid md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : matches.length === 0 ? (
        <Card>
          <EmptyState
            title={t('talentDash.emptyTitle')}
            description={t('talentDash.emptyDescription')}
            action={<Link to="/talent/profile" className="btn-secondary">{t('talentDash.refineProfile')}</Link>}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {matches.map((m) => {
            const proposals = proposalsByMatch[m.id] ?? []
            const pendingProposal = proposals.find((p) => p.status === 'pending') ?? null
            return (
              <OfferCard
                key={m.id}
                m={m}
                rounds={roundsByMatch[m.id] ?? []}
                pendingProposal={pendingProposal}
                actionBusy={actionBusy}
                respond={respond}
                onAcceptOffer={() => void doAction(m.id, 'accept_offer')}
                onDeclineOffer={() => void doAction(m.id, 'decline_offer')}
                onPickSlot={(slot) => pendingProposal && void pickInterviewSlot(m.id, pendingProposal.id, slot)}
                onDeclineProposal={() => pendingProposal && void declineInterviewProposal(m.id, pendingProposal.id)}
                feedbackEntry={talentFeedbackState[m.id] ?? { rating: 0, outcome: '', freeText: '', saving: false, saved: false }}
                onFeedbackChange={(patch) => setTalentFeedbackState((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? { rating: 0, outcome: '', freeText: '', saving: false, saved: false }), ...patch } }))}
                onFeedbackSubmit={() => void submitTalentFeedback(m.id)}
              />
            )
          })}
        </div>
      )}

      <Card className="mt-8 border-2 border-amber-400 bg-amber-50/40">
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="text-sm font-semibold text-amber-900 mb-0.5">
                {t('talentDash.urgentHeading', { cost: URGENT_COST })}
              </div>
              <p className="text-sm text-ink-600">
                {t('talentDash.urgentSubtitle')}
              </p>
            </div>
            {pointsBalance != null && (
              <div className="text-xs text-ink-600 whitespace-nowrap">
                {t('talentDash.balanceLabel')} <span className="font-semibold text-ink-900">{t('talentDash.pointsValue', { n: pointsBalance })}</span>
              </div>
            )}
          </div>
          {urgentMsg && (
            <div className="mb-3"><Alert tone={urgentMsg.tone}>{urgentMsg.text}</Alert></div>
          )}
          {urgentResult && (
            <div className="mb-3 rounded-lg border-2 border-amber-300 bg-white p-4">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                {t('talentDash.urgentMatchBadge')}
              </div>
              <div className="text-base font-semibold text-ink-900">{urgentResult.role.title}</div>
              <div className="mt-0.5 text-xs text-ink-500 flex gap-2 flex-wrap">
                {urgentResult.role.location && <span>{urgentResult.role.location}</span>}
                {urgentResult.role.work_arrangement && (<><span>·</span><span className="capitalize">{urgentResult.role.work_arrangement}</span></>)}
              </div>
              {(urgentResult.role.salary_min || urgentResult.role.salary_max) && (
                <div className="mt-1 text-sm text-ink-700">
                  RM {fmt(urgentResult.role.salary_min)} – {fmt(urgentResult.role.salary_max)} <span className="text-ink-400">{t('talentDash.perMonth')}</span>
                </div>
              )}
              {urgentResult.role.description && (
                <p className="mt-2 text-sm text-ink-600 line-clamp-3">{urgentResult.role.description}</p>
              )}
              <p className="mt-3 text-xs text-ink-500">
                {t('talentDash.urgentStayOpen')}
              </p>
            </div>
          )}
          <Button onClick={handleUrgentJobSearch} disabled={urgentBusy}>
            {urgentBusy ? t('talentDash.searching') : t('talentDash.urgentButton', { cost: URGENT_COST })}
          </Button>
        </div>
      </Card>

      {(matches?.length ?? 0) >= 3 && extraUsed < 3 && (
        <Card className="mt-8 border-dashed border-accent-500">
          <div className="p-6 text-center">
            <div className="text-sm font-medium text-ink-700 mb-1">{t('talentDash.extraLookedAll')}</div>
            <p className="text-sm text-ink-500 mb-4">
              {t('talentDash.extraUnlockRemaining', { count: 3 - extraUsed })}
              <br />
              {pointsBalance != null
                ? t('talentDash.extraPayOrSpendBalance', { cost: POINTS_PER_EXTRA, balance: pointsBalance })
                : t('talentDash.extraPayOrSpend', { cost: POINTS_PER_EXTRA })}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {pointsBalance != null && pointsBalance < POINTS_PER_EXTRA ? (
                <Link
                  to="/points"
                  className="inline-flex items-center rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  {t('talentDash.extraGetPoints', { cost: POINTS_PER_EXTRA })}
                </Link>
              ) : (
                <Button
                  variant="secondary"
                  onClick={handleRedeemExtraTalent}
                  disabled={unlocking || redeemingExtra}
                >
                  {redeemingExtra ? t('talentDash.redeeming') : t('talentDash.extraUsePoints', { cost: POINTS_PER_EXTRA })}
                </Button>
              )}
              <Button onClick={handleUnlockExtra} disabled={unlocking || redeemingExtra}>
                {unlocking ? t('talentDash.startingPayment') : t('talentDash.extraUnlockButton')}
              </Button>
            </div>
            {pointsBalance != null && pointsBalance < POINTS_PER_EXTRA && (
              <div className="mt-3 text-xs text-ink-500">
                {t('talentDash.extraEarnHint', { balance: pointsBalance, cost: POINTS_PER_EXTRA })}{' '}
                <Link to="/points" className="font-medium text-brand-700 hover:underline">{t('talentDash.walletPage')}</Link>.
              </div>
            )}
            {unlockMsg && (
              <div className={`mt-3 text-xs ${unlockMsg.tone === 'green' ? 'text-emerald-700' : 'text-red-700'}`}>
                {unlockMsg.text}
              </div>
            )}
          </div>
        </Card>
      )}

      {showJustSavedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center">
            <div className="flex justify-center mb-3">
              <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl">✓</div>
            </div>
            <h2 className="font-display text-2xl text-ink-900 mb-2">{t('talentDash.savedTitle')}</h2>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              {t('talentDash.savedBody')}
            </p>
            <p className="text-xs text-ink-500 mb-5">
              {t('talentDash.savedShareNote')}
            </p>
            <Button className="w-full" onClick={() => setShowJustSavedModal(false)}>
              {t('talentDash.savedGotIt')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function OfferCard({
  m, rounds, pendingProposal, actionBusy,
  respond, onAcceptOffer, onDeclineOffer,
  onPickSlot, onDeclineProposal,
  feedbackEntry, onFeedbackChange, onFeedbackSubmit,
}: {
  m: MatchRow
  rounds: InterviewRound[]
  pendingProposal: InterviewProposal | null
  actionBusy: string | null
  respond: (id: string, next: 'accepted_by_talent' | 'declined_by_talent') => void
  onAcceptOffer: () => void
  onDeclineOffer: () => void
  onPickSlot: (slot: 1 | 2 | 3) => void
  onDeclineProposal: () => void
  feedbackEntry: { rating: number; outcome: string; freeText: string; saving: boolean; saved: boolean; pointsAwarded?: number }
  onFeedbackChange: (patch: Partial<{ rating: number; outcome: string; freeText: string }>) => void
  onFeedbackSubmit: () => void
}) {
  const { t } = useTranslation()
  const pct = Math.round(m.compatibility_score ?? 0)
  const busy = (suffix: string) => actionBusy === `${m.id}:${suffix}`

  return (
    <Card hoverable className="animate-slide-up">
      <div className="p-6">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h3 className="font-display text-xl text-ink-900 mb-0.5">{m.roles?.title ?? t('talentDash.roleFallback')}</h3>
            <div className="text-xs text-ink-500 flex gap-2 flex-wrap">
              {m.roles?.location && <span>{m.roles.location}</span>}
              {m.roles?.work_arrangement && (<><span>·</span><span className="capitalize">{m.roles.work_arrangement}</span></>)}
            </div>
          </div>
          <CompatibilityRing pct={pct} />
        </div>

        {(m.roles?.salary_min || m.roles?.salary_max) && (
          <div className="mb-3 text-sm text-ink-700">
            <span className="font-medium">RM {fmt(m.roles?.salary_min)} – {fmt(m.roles?.salary_max)}</span>
            <span className="text-ink-400"> {t('talentDash.perMonth')}</span>
          </div>
        )}

        {m.roles?.description && (
          <p className="text-sm text-ink-600 line-clamp-3 mb-4">{m.roles.description}</p>
        )}

        {m.application_summary && (
          <div className="mb-3 border border-brand-100 rounded-lg p-3 bg-brand-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">{t('talentDash.yourPitch')}</p>
            <p className="text-sm text-ink-800 leading-relaxed whitespace-pre-line">{m.application_summary}</p>
          </div>
        )}

        <StatusPill status={m.status} />

        {m.roles?.employment_type && m.roles.employment_type !== 'full_time' && (
          <div className="mt-2">
            <Badge tone="accent">{m.roles.employment_type}</Badge>
            {m.roles.hourly_rate != null && (<span className="ml-2 text-xs text-ink-500">RM {Number(m.roles.hourly_rate).toFixed(2)}/hr</span>)}
            {m.roles.duration_days != null && (<span className="ml-2 text-xs text-ink-500">{m.roles.duration_days}d</span>)}
          </div>
        )}

        <MatchExplain reasoning={m.public_reasoning} />

        {/* Pending interview proposal — pick one of 3 slots */}
        {pendingProposal && (
          <div className="mt-4 border-2 border-brand-300 rounded-lg overflow-hidden bg-brand-50/60">
            <div className="bg-brand-100 px-3 py-2 text-xs font-semibold text-brand-900 uppercase tracking-wide">
              {t('talentDash.proposalHeading')}
            </div>
            <div className="p-3 space-y-2">
              {([1, 2, 3] as const).map((slot) => {
                const at = slot === 1 ? pendingProposal.slot_1_at : slot === 2 ? pendingProposal.slot_2_at : pendingProposal.slot_3_at
                const busy = actionBusy === `${m.id}:accept_interview_slot:${slot}`
                return (
                  <div key={slot} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-100 bg-white px-3 py-2">
                    <div className="text-sm text-ink-900">
                      <span className="text-xs text-ink-400 mr-2">{t('talentDash.slotLabel', { n: slot })}</span>
                      {new Date(at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })} {t('talentDash.myt')}
                    </div>
                    <Button
                      size="sm"
                      loading={busy}
                      disabled={actionBusy !== null}
                      onClick={() => onPickSlot(slot)}
                    >
                      {t('talentDash.pickThisTime')}
                    </Button>
                  </div>
                )
              })}
              <Button
                size="sm"
                variant="secondary"
                loading={actionBusy === `${m.id}:decline_interview_proposal`}
                disabled={actionBusy !== null}
                onClick={onDeclineProposal}
              >
                {t('talentDash.proposalNoneWork')}
              </Button>
            </div>
          </div>
        )}

        {/* Interview rounds panel — visible once scheduling begins */}
        {rounds.length > 0 && (
          <div className="mt-4 border border-ink-100 rounded-lg overflow-hidden">
            <div className="bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-600 uppercase tracking-wide">
              {t('talentDash.yourInterviews')}
            </div>
            {rounds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-y-1 px-3 py-2 border-t border-ink-100 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-ink-900">{t('talentDash.roundLabel', { n: r.round_number })}</span>
                  <span className="text-xs text-ink-400 ml-2">
                    {new Date(r.scheduled_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })} {t('talentDash.myt')}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoundBadge status={r.status} />
                  {r.status === 'scheduled' && (
                    <a
                      href={r.interview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2.5 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 font-medium whitespace-nowrap"
                    >
                      {t('talentDash.joinVideoCall')}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Offer panel */}
        {m.status === 'offer_made' && (
          <div className="mt-4 border border-emerald-200 rounded-lg p-4 bg-emerald-50">
            <p className="text-sm font-semibold text-emerald-900 mb-1">{t('talentDash.offerReceivedTitle')}</p>
            <p className="text-xs text-emerald-700 mb-3">
              {t('talentDash.offerCongratsLead')} <strong>{m.roles?.title ?? t('talentDash.roleFallback')}</strong>.{' '}
              {t('talentDash.offerCongratsTail')}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                loading={busy('accept_offer')}
                disabled={actionBusy !== null}
                onClick={onAcceptOffer}
              >
                {t('talentDash.acceptOffer')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy('decline_offer')}
                disabled={actionBusy !== null}
                onClick={onDeclineOffer}
              >
                {t('talentDash.decline')}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {/* Stage 1: new offers — accept/decline */}
          {['generated', 'viewed'].includes(m.status) && (
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => respond(m.id, 'accepted_by_talent')} disabled={actionBusy !== null} loading={actionBusy === `${m.id}:accepted_by_talent`} size="sm">{t('talentDash.accept')}</Button>
              <Button onClick={() => respond(m.id, 'declined_by_talent')} disabled={actionBusy !== null} loading={actionBusy === `${m.id}:declined_by_talent`} size="sm" variant="secondary">{t('talentDash.decline')}</Button>
            </div>
          )}

          {/* Feedback widget */}
          {['interview_completed', 'offer_made', 'hired'].includes(m.status) && (
            <div className="border border-ink-200 rounded-lg p-3 space-y-2 bg-ink-50">
              <p className="text-xs font-semibold text-ink-700 uppercase tracking-wide">{t('talentDash.rateOpportunity')}</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => onFeedbackChange({ rating: star })}
                    className={`text-xl leading-none transition-colors ${feedbackEntry.rating >= star ? 'text-amber-400' : 'text-ink-200 hover:text-amber-300'}`}
                    aria-label={t('talentDash.starAria', { n: star })}
                  >
                    ★
                  </button>
                ))}
                {feedbackEntry.rating > 0 && (
                  <span className="ml-2 text-xs text-ink-500">
                    {['', t('talentDash.ratePoor'), t('talentDash.rateBelowAverage'), t('talentDash.rateAverage'), t('talentDash.rateGood'), t('talentDash.rateExcellent')][feedbackEntry.rating]}
                  </span>
                )}
              </div>
              <select
                value={feedbackEntry.outcome}
                onChange={(e) => onFeedbackChange({ outcome: e.target.value })}
                className="w-full border border-ink-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
              >
                {TALENT_OUTCOME_KEYS.map((o) => <option key={o.value} value={o.value}>{o.emoji}{t(o.tKey)}</option>)}
              </select>
              <textarea
                value={feedbackEntry.freeText}
                onChange={(e) => onFeedbackChange({ freeText: e.target.value })}
                placeholder={t('talentDash.feedbackPlaceholder')}
                rows={2}
                className="w-full border border-ink-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white resize-none"
              />
              {feedbackEntry.saved ? (
                <p className="text-xs text-emerald-600 font-medium">
                  {feedbackEntry.pointsAwarded
                    ? t('talentDash.feedbackSavedPoints', { points: feedbackEntry.pointsAwarded })
                    : t('talentDash.feedbackSaved')}
                </p>
              ) : (
                <Button
                  size="sm"
                  onClick={onFeedbackSubmit}
                  disabled={feedbackEntry.rating === 0 || feedbackEntry.saving}
                  loading={feedbackEntry.saving}
                >
                  {t('talentDash.saveFeedback')}
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
    scheduled: { label: t('talentDash.roundUpcoming'),  tone: 'brand' as const },
    completed: { label: t('talentDash.roundDone'),      tone: 'green' as const },
    cancelled: { label: t('talentDash.roundCancelled'), tone: 'gray' as const },
    no_show:   { label: t('talentDash.roundNoShow'),    tone: 'amber' as const },
  }
  const { label, tone } = m[status] ?? { label: status, tone: 'gray' as const }
  return <Badge tone={tone}>{label}</Badge>
}

function CompatibilityRing({ pct }: { pct: number }) {
  const { t } = useTranslation()
  const radius = 20
  const circ = 2 * Math.PI * radius
  const offset = circ - (pct / 100) * circ
  const tone = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-accent-600' : 'text-ink-400'
  return (
    <div className="relative shrink-0" aria-label={t('talentDash.compatibilityAria', { pct })}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={radius} stroke="currentColor" className="text-ink-100" strokeWidth="4" fill="none" />
        <circle
          cx="26" cy="26" r={radius}
          stroke="currentColor"
          className={tone}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-display font-semibold">{pct}</div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation()
  const m: Record<string, { label: string; tone: 'gray' | 'brand' | 'green' | 'amber' | 'red' }> = {
    generated:            { label: t('talentDash.statusNewMatch'),         tone: 'brand' },
    viewed:               { label: t('talentDash.statusViewed'),           tone: 'gray' },
    accepted_by_talent:   { label: t('talentDash.statusYouAccepted'),      tone: 'green' },
    invited_by_manager:   { label: t('talentDash.statusManagerInvited'),   tone: 'brand' },
    hr_scheduling:        { label: t('talentDash.statusHrScheduling'),     tone: 'amber' },
    interview_scheduled:  { label: t('talentDash.statusInterviewScheduled'), tone: 'green' },
    interview_completed:  { label: t('talentDash.statusInterviewComplete'), tone: 'brand' },
    offer_made:           { label: t('talentDash.statusOfferReceived'),    tone: 'green' },
    hired:                { label: t('talentDash.statusHired'),            tone: 'green' },
    cancelled:            { label: t('talentDash.statusCancelled'),        tone: 'gray' },
    no_show:              { label: t('talentDash.statusNoShow'),           tone: 'red' },
  }
  const entry = m[status] ?? { label: status.replace(/_/g, ' '), tone: 'gray' as const }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

function ExpiryBanner({
  expiresAt, reviving, reviveStep, onReviveClick, onReviveConfirm, onReviveCancel,
}: {
  expiresAt: string | null
  reviving: boolean
  reviveStep: 'idle' | 'confirm'
  onReviveClick: () => void
  onReviveConfirm: () => void
  onReviveCancel: () => void
}) {
  const { t } = useTranslation()
  if (!expiresAt) return null
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
  if (days > 10) return null

  if (days <= 0) {
    if (reviveStep === 'confirm') return (
      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-sm font-semibold text-red-800 mb-0.5">{t('talentDash.reactivateTitle')}</p>
        <p className="text-xs text-red-600 mb-3">
          {t('talentDash.reactivateBody')}
        </p>
        <ul className="text-xs text-ink-700 space-y-1 mb-4 list-disc list-inside">
          <li>{t('talentDash.checkSalaryRange')}</li>
          <li>{t('talentDash.checkJobTypes')}</li>
          <li>{t('talentDash.checkNoticePeriod')}</li>
          <li>{t('talentDash.checkCareerIntention')}</li>
        </ul>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={onReviveConfirm} loading={reviving} size="sm">{t('talentDash.confirmRevive')}</Button>
          <Link to="/talent/profile" className="btn-secondary text-xs px-3 py-1.5 rounded-md">{t('talentDash.updateFirst')}</Link>
          <button onClick={onReviveCancel} className="text-xs text-ink-400 hover:text-ink-600 px-2">{t('talentDash.cancel')}</button>
        </div>
      </div>
    )
    return (
      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-red-800">{t('talentDash.profileExpired')}</p>
          <p className="text-xs text-red-600 mt-0.5">{t('talentDash.profileExpiredBody')}</p>
        </div>
        <Button onClick={onReviveClick} loading={reviving} size="sm">{t('talentDash.reviveProfile')}</Button>
      </div>
    )
  }

  if (reviveStep === 'confirm') return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <p className="text-sm font-semibold text-amber-800 mb-0.5">{t('talentDash.quickCheckTitle')}</p>
      <p className="text-xs text-amber-600 mb-3">
        {t('talentDash.quickCheckBody')}
      </p>
      <ul className="text-xs text-ink-700 space-y-1 mb-4 list-disc list-inside">
        <li>{t('talentDash.checkSalaryRange')}</li>
        <li>{t('talentDash.checkJobTypes')}</li>
        <li>{t('talentDash.checkNoticePeriod')}</li>
        <li>{t('talentDash.checkCareerIntention')}</li>
      </ul>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={onReviveConfirm} loading={reviving} size="sm" variant="secondary">{t('talentDash.confirmExtend')}</Button>
        <Link to="/talent/profile" className="btn-secondary text-xs px-3 py-1.5 rounded-md">{t('talentDash.updateFirst')}</Link>
        <button onClick={onReviveCancel} className="text-xs text-ink-400 hover:text-ink-600 px-2">{t('talentDash.cancel')}</button>
      </div>
    </div>
  )

  return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-amber-800">{t('talentDash.expiresInDays', { count: days })}</p>
        <p className="text-xs text-amber-600 mt-0.5">{t('talentDash.extendNowBody')}</p>
      </div>
      <Button onClick={onReviveClick} loading={reviving} size="sm" variant="secondary">{t('talentDash.extend45Days')}</Button>
    </div>
  )
}

function CareerHealthPanel({ reputation }: {
  reputation: { reputation_score: number | null; feedback_volume: number; phs_show_rate: number | null; phs_accept_rate: number | null }
}) {
  const { t } = useTranslation()
  const score = reputation.reputation_score
  const scoreTone = score == null ? 'gray' : score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red'
  return (
    <Card className="mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-0.5">{t('talentDash.careerHealth')}</p>
            <p className="text-xs text-ink-400">{t('talentDash.basedOnReviews', { count: reputation.feedback_volume })}</p>
          </div>
          {score != null && <Badge tone={scoreTone as 'gray' | 'green' | 'amber' | 'brand' | 'accent' | 'red'}>{Math.round(score)} / 100</Badge>}
        </div>
        <div className="flex gap-6 flex-wrap">
          {reputation.phs_show_rate != null && (
            <div>
              <p className="text-xs text-ink-500">{t('talentDash.interviewAttendance')}</p>
              <p className="text-sm font-semibold text-ink-900">{Math.round(reputation.phs_show_rate * 100)}%</p>
            </div>
          )}
          {reputation.phs_accept_rate != null && (
            <div>
              <p className="text-xs text-ink-500">{t('talentDash.offerAcceptance')}</p>
              <p className="text-sm font-semibold text-ink-900">{Math.round(reputation.phs_accept_rate * 100)}%</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

const TOTAL_PROFILE_FIELDS = 12

function ProfileCompletenessBar({ gaps }: { gaps: string[] }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const filled = TOTAL_PROFILE_FIELDS - gaps.length
  const pct = Math.round((filled / TOTAL_PROFILE_FIELDS) * 100)
  const barTone = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <Card className="mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t('talentDash.completenessTitle')}</p>
            <p className="text-xs text-ink-400 mt-0.5">
              {pct >= 80
                ? t('talentDash.completenessHigh')
                : pct >= 50
                ? t('talentDash.completenessMid')
                : t('talentDash.completenessLow')}
            </p>
          </div>
          <span className={`text-sm font-bold ${pct >= 80 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-600'}`}>
            {pct}%
          </span>
        </div>
        <div className="h-2 bg-ink-100 rounded-full overflow-hidden mb-3">
          <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${pct}%` }} />
        </div>
        {gaps.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              {expanded ? t('talentDash.hide') : t('talentDash.fieldsMissing', { count: gaps.length })}
            </button>
            {expanded && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {gaps.map((g) => (
                  <span key={g} className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                    {t(g)}
                  </span>
                ))}
                <a href="/talent/profile" className="text-xs text-brand-600 hover:text-brand-700 underline ml-1">
                  {t('talentDash.updateProfile')}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
