import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../../state/useSession'
import { supabase } from '../../../lib/supabase'
import { callFunction } from '../../../lib/functions'
import { writeDashCache } from '../../../lib/dashboardCache'
import { confirmDialog } from '../../../components/Modal'
import type { InterviewRound, InterviewProposal } from '../../../types/db'
import { talentMatchesForTalent, talentMatchById, updateMatch } from '../../../data/repositories/matches'
import { interviewRoundsForMatches, talentInterviewProposalsForMatches } from '../../../data/repositories/interviews'
import { profilePointsById } from '../../../data/repositories/profiles'
import { getUrgentRoleCard } from '../../../data/repositories/roles'
import { talentDashboardSnapshotByProfileId, talentExtractionStatusByProfileId, talentIdByProfileId, updateTalentById } from '../../../data/repositories/talents'
import { lastCompletedFindJobRequest } from '../../../data/repositories/urgentRequests'
import { useMountedRef, useReloadTimer, useDashCacheSnapshot } from '../useDashboardResource'
import {
  ACTIVE,
  computeProfileGaps,
  type MatchRow,
  type TalentCacheSnapshot,
  type TalentFeedbackEntry,
} from './types'

/**
 * Data-loading + derived-state orchestration for TalentDashboard.
 *
 * RELOCATE, not redesign — every state hook, effect (including the realtime
 * subscription semantics, effect dependency arrays, and order of operations),
 * callback, and action handler was moved here verbatim from the component. The
 * component consumes the returned bag and renders identically.
 */
export function useTalentDashboardData() {
  const { t } = useTranslation()
  const { session, profile } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  // Cached counts hydrate the KPI strip instantly. `matches` itself remains
  // null until fresh data arrives, but the headline numbers don't shimmer.
  const cachedSnap = useDashCacheSnapshot<TalentCacheSnapshot>('talent_dashboard', session?.user.id)
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
  const reloadTimerRef = useReloadTimer()
  const mountedRef = useMountedRef()
  const [talentReputation, setTalentReputation] = useState<{ reputation_score: number | null; feedback_volume: number; phs_show_rate: number | null; phs_accept_rate: number | null } | null>(null)
  const [profileGaps, setProfileGaps] = useState<string[]>([])
  const [talentFeedbackState, setTalentFeedbackState] = useState<Record<string, TalentFeedbackEntry>>({})

  // Interview flow state
  const [roundsByMatch, setRoundsByMatch] = useState<Record<string, InterviewRound[]>>({})
  const [proposalsByMatch, setProposalsByMatch] = useState<Record<string, InterviewProposal[]>>({})
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const loadRounds = useCallback(async (matchIds: string[]) => {
    if (matchIds.length === 0) return
    const { data, error } = await interviewRoundsForMatches(matchIds)
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
    const { data, error } = await talentInterviewProposalsForMatches(matchIds)
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
          talentDashboardSnapshotByProfileId(userId),
          profilePointsById(userId).maybeSingle(),
          lastCompletedFindJobRequest(userId, new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
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
        const gaps = computeProfileGaps(t2)
        if (!cancelled) setProfileGaps(gaps)

        // Phase 2 — matches (needs talent.id) and the urgent role (needs
        // lastUrgent.result_id, conditional) fire in parallel.
        // Rehydrates the most recent successful urgent job result so it survives
        // page reload (BUG 5 fix). Only for find_job requests, last 24h, with
        // a result_id that still points at an active role.
        const urgentRolePromise = lastUrgent?.result_id
          ? getUrgentRoleCard(lastUrgent.result_id)
          : Promise.resolve({ data: null })

        const [{ data, error }, urgentRoleRes] = await Promise.all([
          talentMatchesForTalent(talent.id, ACTIVE)
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
          // Prune match-keyed maps to the current match set so they don't grow
          // unbounded across refreshes over a long session. Rebuild each map from
          // the current ids, dropping entries for matches no longer present;
          // entries for current matches are preserved verbatim.
          const currentMatchIds = new Set(rows.map((m) => m.id))
          const pruneByMatch = <V,>(prev: Record<string, V>): Record<string, V> => {
            const next: Record<string, V> = {}
            for (const id of Object.keys(prev)) {
              if (currentMatchIds.has(id)) next[id] = prev[id]
            }
            return next
          }
          setRoundsByMatch(pruneByMatch)
          setProposalsByMatch(pruneByMatch)
          setTalentFeedbackState(pruneByMatch)
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
      const { data } = await talentExtractionStatusByProfileId(userId)
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

  // Keyboard-dismiss parity: close the 'just saved' dialog on Escape (the
  // mouse/'Got it' button path is unchanged).
  useEffect(() => {
    if (!showJustSavedModal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowJustSavedModal(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showJustSavedModal])

  async function reviveProfile() {
    if (!session) return
    setReviving(true); setErr(null)
    try {
      const { data: talentRow } = await talentIdByProfileId(session.user.id)
      if (!mountedRef.current) return
      if (!talentRow) return
      const newExpiry = new Date(Date.now() + 45 * 86400000).toISOString()
      const { error } = await updateTalentById(talentRow.id, {
        profile_expires_at: newExpiry,
        is_open_to_offers: true,
        ghost_score: 0,
      })
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
    if (!(await confirmDialog({
      title: t('talentDash.redeemConfirmTitle', 'Redeem points?'),
      message: t('talentDash.redeemConfirm', { cost: POINTS_PER_EXTRA }),
      confirmLabel: t('common.confirm', 'Confirm'),
    }))) return
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
            <Link to="/points" className="font-semibold underline hover:text-ink-900 dark:hover:text-white">
              {t('talentDash.urgentBuyOrEarn')}
            </Link>
          </>
        ),
      })
      return
    }
    if (!(await confirmDialog({
      title: t('talentDash.urgentConfirmTitle', 'Use priority search?'),
      message: t('talentDash.urgentConfirm', { cost: URGENT_COST }),
      confirmLabel: t('common.confirm', 'Confirm'),
    }))) return
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
      void talentMatchById(matchId)
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
      const { error } = await updateMatch(id, {
        status: next,
        viewed_at: new Date().toISOString(),
        accepted_at: next === 'accepted_by_talent' ? new Date().toISOString() : null,
      })
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

  return {
    // session-derived
    profile,
    // pricing/gating constants
    POINTS_PER_EXTRA,
    URGENT_COST,
    // core data
    matches,
    err,
    extractionStatus,
    showJustSavedModal, setShowJustSavedModal,
    extraUsed,
    unlocking,
    redeemingExtra,
    unlockMsg,
    urgentBusy,
    urgentResult,
    urgentMsg,
    pointsBalance,
    profileExpiresAt,
    reviving,
    reviveStep, setReviveStep,
    talentReputation,
    profileGaps,
    talentFeedbackState, setTalentFeedbackState,
    roundsByMatch,
    proposalsByMatch,
    actionBusy,
    // derived KPI counts
    openCount,
    inFlight,
    totalActive,
    slotsAvailable,
    // actions
    reviveProfile,
    handleUnlockExtra,
    handleRedeemExtraTalent,
    handleUrgentJobSearch,
    doAction,
    pickInterviewSlot,
    declineInterviewProposal,
    submitTalentFeedback,
    respond,
  }
}
