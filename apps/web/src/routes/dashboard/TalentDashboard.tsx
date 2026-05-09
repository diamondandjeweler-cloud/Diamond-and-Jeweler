import { useEffect, useState, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useSeo } from '../../lib/useSeo'
import { getDisplayName } from '../../lib/displayName'
import { Button, Card, Badge, Alert, EmptyState, PageHeader, Stat } from '../../components/ui'
import MatchExplain from '../../components/MatchExplain'
import CareerNudgePanel from '../../components/CareerNudgePanel'
import GrowthNudgePreferences from '../../components/GrowthNudgePreferences'
import type { PublicReasoning } from '../../types/db'

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

const ACTIVE = [
  'generated', 'viewed', 'accepted_by_talent',
  'invited_by_manager', 'hr_scheduling',
  'interview_scheduled', 'interview_completed',
  'offer_made',
]

const TALENT_OUTCOMES = [
  { value: '', label: 'Select outcome (optional)' },
  { value: 'accepted_offer',      label: '✅ I accepted the offer' },
  { value: 'offer_declined',      label: '❌ I declined the offer' },
  { value: 'company_ghosted',     label: '👻 Company ghosted me' },
  { value: 'passed_probation',    label: '🏆 Passed probation' },
  { value: 'failed_probation',    label: '⚠️ Did not pass probation' },
  { value: 'still_employed_6m',   label: '📅 Still employed at 6 months' },
  { value: 'still_employed_1y',   label: '🎉 Still employed at 1 year' },
]

export default function TalentDashboard() {
  useSeo({ title: 'My offers', noindex: true })
  const { t } = useTranslation()
  const { session, profile } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null)
  const [showJustSavedModal, setShowJustSavedModal] = useState<boolean>(
    Boolean((location.state as { extractionPending?: boolean } | null)?.extractionPending),
  )
  const [extraUsed, setExtraUsed] = useState(0)
  const [unlocking, setUnlocking] = useState(false)
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
  const [talentReputation, setTalentReputation] = useState<{ reputation_score: number | null; feedback_volume: number; phs_show_rate: number | null; phs_accept_rate: number | null } | null>(null)
  const [profileGaps, setProfileGaps] = useState<string[]>([])
  const [talentFeedbackState, setTalentFeedbackState] = useState<Record<string, { rating: number; outcome: string; freeText: string; saving: boolean; saved: boolean; pointsAwarded?: number }>>({})

  // Interview flow state
  const [roundsByMatch, setRoundsByMatch] = useState<Record<string, InterviewRound[]>>({})
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const loadRounds = useCallback(async (matchIds: string[]) => {
    if (matchIds.length === 0) return
    const { data } = await supabase
      .from('interview_rounds')
      .select('id, match_id, round_number, scheduled_at, interview_url, status')
      .in('match_id', matchIds)
      .order('round_number', { ascending: true })
    if (!data) return
    const grouped: Record<string, InterviewRound[]> = {}
    for (const r of data) {
      if (!grouped[r.match_id]) grouped[r.match_id] = []
      grouped[r.match_id].push(r as InterviewRound)
    }
    setRoundsByMatch((prev) => ({ ...prev, ...grouped }))
  }, [])

  useEffect(() => {
    let cancelled = false
    let talentId: string | null = null

    async function load() {
      if (!session) { setLoading(false); return }
      try {
        const { data: talent } = await supabase.from('talents').select('id, extra_matches_used, profile_expires_at, reputation_score, feedback_volume, phs_show_rate, phs_accept_rate, current_employment_status, current_salary, notice_period_days, education_level, has_management_experience, work_authorization, preferred_management_style, expected_salary_min, expected_salary_max, employment_type_preferences, location_matters, career_goal_horizon, job_intention, has_noncompete, salary_structure_preference, role_scope_preference, reason_for_leaving_category, extraction_status').eq('profile_id', session.user.id).maybeSingle()
        if (cancelled) return
        if (!talent) return
        setExtractionStatus((talent as unknown as { extraction_status: string | null }).extraction_status ?? 'complete')
        talentId = talent.id
        setExtraUsed(talent.extra_matches_used ?? 0)
        const { data: pointsRow } = await supabase.from('profiles')
          .select('points').eq('id', session.user.id).maybeSingle()
        if (!cancelled) setPointsBalance(pointsRow?.points ?? 0)
        setProfileExpiresAt((talent as unknown as { profile_expires_at: string | null }).profile_expires_at ?? null)
        setTalentReputation({
          reputation_score: (talent as unknown as { reputation_score: number | null }).reputation_score ?? null,
          feedback_volume: (talent as unknown as { feedback_volume: number }).feedback_volume ?? 0,
          phs_show_rate: (talent as unknown as { phs_show_rate: number | null }).phs_show_rate ?? null,
          phs_accept_rate: (talent as unknown as { phs_accept_rate: number | null }).phs_accept_rate ?? null,
        })
        const t2 = talent as unknown as Record<string, unknown>
        const gaps: string[] = []
        if (!t2.current_employment_status)                gaps.push('Current employment status')
        if (t2.current_salary == null)                    gaps.push('Current salary')
        if (!t2.education_level)                          gaps.push('Education level')
        if (!t2.work_authorization)                       gaps.push('Work authorization')
        if (t2.expected_salary_min == null)               gaps.push('Expected salary range')
        if (!Array.isArray(t2.employment_type_preferences) || (t2.employment_type_preferences as unknown[]).length === 0)
                                                          gaps.push('Employment type preference')
        if (!t2.preferred_management_style)               gaps.push('Management style preference')
        if (!t2.career_goal_horizon)                      gaps.push('Career goal')
        if (!t2.job_intention)                            gaps.push('Long-term intention')
        if (t2.has_noncompete == null)                    gaps.push('Non-compete status')
        if (!t2.salary_structure_preference)              gaps.push('Salary structure preference')
        if (t2.notice_period_days == null)                gaps.push('Notice period')
        if (!cancelled) setProfileGaps(gaps)

        // Rehydrate the most recent successful urgent job result so it survives
        // page reload (BUG 5 fix). Only for find_job requests, last 24h, with
        // a result_id that still points at an active role.
        const { data: lastUrgent } = await supabase
          .from('urgent_priority_requests')
          .select('id, result_id, completed_at')
          .eq('user_id', session.user.id)
          .eq('request_type', 'find_job')
          .eq('status', 'completed')
          .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!cancelled && lastUrgent?.result_id) {
          const { data: urgentRole } = await supabase.from('roles')
            .select('id, title, description, salary_min, salary_max, location, work_arrangement, status')
            .eq('id', lastUrgent.result_id)
            .maybeSingle()
          if (urgentRole && urgentRole.status === 'active') {
            setUrgentResult({ role: urgentRole as { id: string; title: string; description: string | null; salary_min: number | null; salary_max: number | null; location: string | null; work_arrangement: string | null } })
          }
        }

        const { data, error } = await supabase
          .from('matches')
          .select('id, compatibility_score, status, expires_at, public_reasoning, application_summary, roles(id, title, description, salary_min, salary_max, location, work_arrangement, employment_type, hourly_rate, duration_days)')
          .eq('talent_id', talent.id)
          .in('status', ACTIVE)
          .order('created_at', { ascending: false })
        if (cancelled) return
        if (error) setErr(error.message)
        else {
          const rows = (data ?? []) as unknown as MatchRow[]
          setMatches(rows)
          const interviewMatchIds = rows
            .filter((r) => ['invited_by_manager', 'interview_scheduled', 'interview_completed', 'offer_made'].includes(r.status))
            .map((r) => r.id)
          await loadRounds(interviewMatchIds)
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load offers')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()

    const channel = supabase
      .channel(`talent-matches-${session?.user.id ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: talentId ? `talent_id=eq.${talentId}` : undefined }, (payload) => {
        if (!talentId) return
        const next = payload.new as MatchRow & { talent_id?: string } | null
        const prev = payload.old as MatchRow & { talent_id?: string } | null
        if (next?.talent_id !== talentId && prev?.talent_id !== talentId) return
        setMatches((xs) => {
          if (payload.eventType === 'DELETE') return xs.filter((m) => m.id !== prev?.id)
          if (payload.eventType === 'INSERT' && next) return [next, ...xs]
          if (payload.eventType === 'UPDATE' && next) return xs.map((m) => (m.id === next.id ? { ...m, ...next } : m))
          return xs
        })
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

    return () => { cancelled = true; void supabase.removeChannel(channel) }
  }, [session, loadRounds])

  // Poll the talents row while extraction is in flight so the banner clears
  // and matches start flowing once the worker finishes. Stops on terminal state.
  useEffect(() => {
    if (!session) return
    if (extractionStatus !== 'pending' && extractionStatus !== 'processing') return
    let cancelled = false
    const tick = async () => {
      const { data } = await supabase
        .from('talents')
        .select('extraction_status')
        .eq('profile_id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      const next = (data as { extraction_status: string | null } | null)?.extraction_status ?? null
      if (next && next !== extractionStatus) setExtractionStatus(next)
    }
    const id = window.setInterval(() => { void tick() }, 10_000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [session, extractionStatus])

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
      const { data: t } = await supabase.from('talents').select('id').eq('profile_id', session.user.id).maybeSingle()
      if (!t) return
      const newExpiry = new Date(Date.now() + 45 * 86400000).toISOString()
      const { error } = await supabase.from('talents').update({
        profile_expires_at: newExpiry,
        is_open_to_offers: true,
        ghost_score: 0,
      }).eq('id', t.id)
      if (error) throw error
      setProfileExpiresAt(newExpiry)
      setReviveStep('idle')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to revive profile')
    } finally {
      setReviving(false)
    }
  }

  async function handleUnlockExtra() {
    setErr(null); setUnlocking(true)
    try {
      const res = await callFunction<{ paymentUrl: string }>('unlock-extra-match', { match_type: 'talent_extra' })
      if (res?.paymentUrl) window.location.href = res.paymentUrl
      else setErr('Could not start payment')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to start payment')
    } finally { setUnlocking(false) }
  }

  async function handleUrgentJobSearch() {
    setUrgentMsg(null); setUrgentResult(null); setErr(null)
    if (pointsBalance != null && pointsBalance < URGENT_COST) {
      setUrgentMsg({
        tone: 'amber',
        text: (
          <>
            You need {URGENT_COST} Diamond Points (you have {pointsBalance}).{' '}
            <Link to="/points" className="font-semibold underline hover:text-ink-900">
              Buy or earn more →
            </Link>
          </>
        ),
      })
      return
    }
    if (!window.confirm(`Spend ${URGENT_COST} Diamond Points to instantly surface 1 top-matching open job?`)) return
    setUrgentBusy(true)
    try {
      const res = await callFunction<{
        success: boolean
        cost: number
        balance_after: number
        result: { kind: 'role'; role: { id: string; title: string; description: string | null; salary_min: number | null; salary_max: number | null; location: string | null; work_arrangement: string | null } } | null
        message?: string
      }>('urgent-priority-search', { request_type: 'find_job' })
      if (typeof res.balance_after === 'number') setPointsBalance(res.balance_after)
      if (!res.result) {
        setUrgentMsg({ tone: 'amber', text: res.message ?? 'No matching open role right now.' })
      } else {
        setUrgentResult({ role: res.result.role })
        setUrgentMsg({
          tone: 'green',
          text: `Found 1 top-matching open job. Balance: ${res.balance_after} Diamond Points.`,
        })
      }
    } catch (e) {
      setUrgentMsg({ tone: 'red', text: e instanceof Error ? e.message : 'Urgent search failed.' })
    } finally { setUrgentBusy(false) }
  }

  async function doAction(matchId: string, action: string) {
    setErr(null)
    setActionBusy(`${matchId}:${action}`)
    try {
      await callFunction('interview-action', { action, match_id: matchId })
      const { data: updated } = await supabase
        .from('matches')
        .select('id, compatibility_score, status, expires_at, public_reasoning, application_summary, roles(id, title, description, salary_min, salary_max, location, work_arrangement, employment_type, hourly_rate, duration_days)')
        .eq('id', matchId)
        .maybeSingle()
      if (updated) setMatches((ms) => ms.map((m) => (m.id === matchId ? (updated as unknown as MatchRow) : m)))
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Action failed: ${action}`)
    } finally {
      setActionBusy(null)
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
      setTalentFeedbackState((s) => ({
        ...s,
        [matchId]: { ...s[matchId], saving: false, saved: true, pointsAwarded: result?.points_awarded ?? 0 },
      }))
    } catch (e) {
      setTalentFeedbackState((s) => ({ ...s, [matchId]: { ...s[matchId], saving: false } }))
      setErr(e instanceof Error ? e.message : 'Failed to save feedback')
    }
  }

  async function respond(id: string, next: 'accepted_by_talent' | 'declined_by_talent') {
    const current = matches.find((m) => m.id === id)
    setMatches((ms) => ms.map((m) => (m.id === id ? { ...m, status: next } : m)))
    const { error } = await supabase.from('matches').update({
      status: next,
      viewed_at: new Date().toISOString(),
      accepted_at: next === 'accepted_by_talent' ? new Date().toISOString() : null,
    }).eq('id', id)
    if (error) {
      setErr(error.message)
      setMatches((ms) => ms.map((m) => (m.id === id ? { ...m, status: current?.status ?? 'generated' } : m)))
      return
    }
    const event_type = next === 'accepted_by_talent' ? 'accept_interview' : 'reject_with_reason'
    try { await callFunction('award-points', { event_type, match_id: id }) } catch { /* tolerate */ }
  }

  if (loading) return <LoadingSpinner />

  const openCount = matches.filter((m) => ['generated', 'viewed'].includes(m.status)).length
  const inFlight  = matches.filter((m) => !['generated', 'viewed'].includes(m.status)).length

  return (
    <div>
      <PageHeader
        eyebrow={profile && t('dashboard.talentGreeting', { name: getDisplayName(profile) })}
        title="Your top opportunities"
        description="Up to three curated matches at a time. Accept or decline — no applications needed."
        actions={<Link to="/talent/profile" className="btn-secondary">Edit profile</Link>}
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
            <div className="font-semibold">Your profile is being analysed</div>
            <div className="text-brand-800 mt-0.5">
              Our AI is putting together your career summary. This usually finishes in under 2 minutes — your matches will start appearing once it's ready.
            </div>
          </div>
        </div>
      )}

      {extractionStatus === 'failed' && (
        <div className="mb-6"><Alert tone="red">
          We couldn't finish analysing your profile. <Link to="/talent/profile" className="underline font-semibold">Open your profile</Link> to retry.
        </Alert></div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Awaiting response" value={openCount} tone={openCount > 0 ? 'brand' : 'default'} />
        <Stat label="In progress" value={inFlight} />
        <Stat label="Total active" value={matches.length} />
        <Stat label="Slots available" value={Math.max(0, 3 - matches.length)} hint="We curate up to 3 at a time" />
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

      {matches.length === 0 ? (
        <Card>
          <EmptyState
            title="Still finding your matches"
            description="Our engine reviews new roles every hour. You'll see up to 3 offers as soon as they're ready. Pilot estimate: ~14 days."
            action={<Link to="/talent/profile" className="btn-secondary">Refine your profile</Link>}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {matches.map((m) => (
            <OfferCard
              key={m.id}
              m={m}
              rounds={roundsByMatch[m.id] ?? []}
              actionBusy={actionBusy}
              respond={respond}
              onAcceptOffer={() => void doAction(m.id, 'accept_offer')}
              onDeclineOffer={() => void doAction(m.id, 'decline_offer')}
              feedbackEntry={talentFeedbackState[m.id] ?? { rating: 0, outcome: '', freeText: '', saving: false, saved: false }}
              onFeedbackChange={(patch) => setTalentFeedbackState((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? { rating: 0, outcome: '', freeText: '', saving: false, saved: false }), ...patch } }))}
              onFeedbackSubmit={() => void submitTalentFeedback(m.id)}
            />
          ))}
        </div>
      )}

      <Card className="mt-8 border-2 border-amber-400 bg-amber-50/40">
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="text-sm font-semibold text-amber-900 mb-0.5">
                🔥 Urgent Priority Job Search — {URGENT_COST} Diamond Points
              </div>
              <p className="text-sm text-ink-600">
                Surface 1 top-matching open role on the spot — no waiting on the queue.
              </p>
            </div>
            {pointsBalance != null && (
              <div className="text-xs text-ink-600 whitespace-nowrap">
                Balance: <span className="font-semibold text-ink-900">{pointsBalance} Diamond Points</span>
              </div>
            )}
          </div>
          {urgentMsg && (
            <div className="mb-3"><Alert tone={urgentMsg.tone}>{urgentMsg.text}</Alert></div>
          )}
          {urgentResult && (
            <div className="mb-3 rounded-lg border-2 border-amber-300 bg-white p-4">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                🔥 Urgent Match
              </div>
              <div className="text-base font-semibold text-ink-900">{urgentResult.role.title}</div>
              <div className="mt-0.5 text-xs text-ink-500 flex gap-2 flex-wrap">
                {urgentResult.role.location && <span>{urgentResult.role.location}</span>}
                {urgentResult.role.work_arrangement && (<><span>·</span><span className="capitalize">{urgentResult.role.work_arrangement}</span></>)}
              </div>
              {(urgentResult.role.salary_min || urgentResult.role.salary_max) && (
                <div className="mt-1 text-sm text-ink-700">
                  RM {fmt(urgentResult.role.salary_min)} – {fmt(urgentResult.role.salary_max)} <span className="text-ink-400">/ month</span>
                </div>
              )}
              {urgentResult.role.description && (
                <p className="mt-2 text-sm text-ink-600 line-clamp-3">{urgentResult.role.description}</p>
              )}
              <p className="mt-3 text-xs text-ink-500">
                Stay open to offers — if this employer's match engine surfaces you, the role will appear above as a regular match.
              </p>
            </div>
          )}
          <Button onClick={handleUrgentJobSearch} disabled={urgentBusy}>
            {urgentBusy ? 'Searching…' : `Urgent — ${URGENT_COST} Diamond Points`}
          </Button>
        </div>
      </Card>

      {matches.length >= 3 && extraUsed < 3 && (
        <Card className="mt-8 border-dashed border-accent-500">
          <div className="p-6 text-center">
            <div className="text-sm font-medium text-ink-700 mb-1">Already looked at all three?</div>
            <p className="text-sm text-ink-500 mb-4">
              Unlock one extra offer curated for you. You have {3 - extraUsed} extra unlock{3 - extraUsed === 1 ? '' : 's'} remaining.
            </p>
            <Button onClick={handleUnlockExtra} disabled={unlocking}>
              {unlocking ? 'Starting payment…' : 'Unlock extra offer — RM 9.90'}
            </Button>
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
            <h2 className="font-display text-2xl text-ink-900 mb-2">Profile saved</h2>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              Our AI is now analysing your conversation in the background — usually under 2 minutes. You can leave or close this tab; matches will start flowing once your summary is ready.
            </p>
            <p className="text-xs text-ink-500 mb-5">
              We'll only share your summary with a Hiring Manager when there's a match.
            </p>
            <Button className="w-full" onClick={() => setShowJustSavedModal(false)}>
              Got it
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function OfferCard({
  m, rounds, actionBusy,
  respond, onAcceptOffer, onDeclineOffer,
  feedbackEntry, onFeedbackChange, onFeedbackSubmit,
}: {
  m: MatchRow
  rounds: InterviewRound[]
  actionBusy: string | null
  respond: (id: string, next: 'accepted_by_talent' | 'declined_by_talent') => void
  onAcceptOffer: () => void
  onDeclineOffer: () => void
  feedbackEntry: { rating: number; outcome: string; freeText: string; saving: boolean; saved: boolean; pointsAwarded?: number }
  onFeedbackChange: (patch: Partial<{ rating: number; outcome: string; freeText: string }>) => void
  onFeedbackSubmit: () => void
}) {
  const pct = Math.round(m.compatibility_score ?? 0)
  const busy = (suffix: string) => actionBusy === `${m.id}:${suffix}`

  return (
    <Card hoverable className="animate-slide-up">
      <div className="p-6">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h3 className="font-display text-xl text-ink-900 mb-0.5">{m.roles?.title ?? 'Role'}</h3>
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
            <span className="text-ink-400"> / month</span>
          </div>
        )}

        {m.roles?.description && (
          <p className="text-sm text-ink-600 line-clamp-3 mb-4">{m.roles.description}</p>
        )}

        {m.application_summary && (
          <div className="mb-3 border border-brand-100 rounded-lg p-3 bg-brand-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">Your pitch for this role</p>
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

        {/* Interview rounds panel — visible once scheduling begins */}
        {rounds.length > 0 && (
          <div className="mt-4 border border-ink-100 rounded-lg overflow-hidden">
            <div className="bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-600 uppercase tracking-wide">
              Your interviews
            </div>
            {rounds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-y-1 px-3 py-2 border-t border-ink-100 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-ink-900">Round {r.round_number}</span>
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
                      className="text-xs px-2.5 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 font-medium whitespace-nowrap"
                    >
                      Join video call
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
            <p className="text-sm font-semibold text-emerald-900 mb-1">You have received a job offer!</p>
            <p className="text-xs text-emerald-700 mb-3">
              Congratulations — the hiring manager wants to hire you for <strong>{m.roles?.title}</strong>.
              Accept to move forward, or decline if it's not the right fit.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                loading={busy('accept_offer')}
                disabled={actionBusy !== null}
                onClick={onAcceptOffer}
              >
                Accept offer
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy('decline_offer')}
                disabled={actionBusy !== null}
                onClick={onDeclineOffer}
              >
                Decline
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {/* Stage 1: new offers — accept/decline */}
          {['generated', 'viewed'].includes(m.status) && (
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => respond(m.id, 'accepted_by_talent')} size="sm">Accept</Button>
              <Button onClick={() => respond(m.id, 'declined_by_talent')} size="sm" variant="secondary">Decline</Button>
            </div>
          )}

          {/* Feedback widget */}
          {['interview_completed', 'offer_made', 'hired'].includes(m.status) && (
            <div className="border border-ink-200 rounded-lg p-3 space-y-2 bg-ink-50">
              <p className="text-xs font-semibold text-ink-700 uppercase tracking-wide">Rate this opportunity</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => onFeedbackChange({ rating: star })}
                    className={`text-xl leading-none transition-colors ${feedbackEntry.rating >= star ? 'text-amber-400' : 'text-ink-200 hover:text-amber-300'}`}
                    aria-label={`${star} star`}
                  >
                    ★
                  </button>
                ))}
                {feedbackEntry.rating > 0 && (
                  <span className="ml-2 text-xs text-ink-500">
                    {['', 'Poor', 'Below average', 'Average', 'Good', 'Excellent'][feedbackEntry.rating]}
                  </span>
                )}
              </div>
              <select
                value={feedbackEntry.outcome}
                onChange={(e) => onFeedbackChange({ outcome: e.target.value })}
                className="w-full border border-ink-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
              >
                {TALENT_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <textarea
                value={feedbackEntry.freeText}
                onChange={(e) => onFeedbackChange({ freeText: e.target.value })}
                placeholder="How was the interview experience? Your feedback improves hiring quality (optional)"
                rows={2}
                className="w-full border border-ink-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white resize-none"
              />
              {feedbackEntry.saved ? (
                <p className="text-xs text-emerald-600 font-medium">
                  ✓ Feedback saved{feedbackEntry.pointsAwarded ? ` — +${feedbackEntry.pointsAwarded} Diamond Points` : ''}
                </p>
              ) : (
                <Button
                  size="sm"
                  onClick={onFeedbackSubmit}
                  disabled={feedbackEntry.rating === 0 || feedbackEntry.saving}
                  loading={feedbackEntry.saving}
                >
                  Save feedback (+5 Diamond Points)
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
  const m = {
    scheduled: { label: 'Upcoming', tone: 'brand' as const },
    completed: { label: 'Done',     tone: 'green' as const },
    cancelled: { label: 'Cancelled', tone: 'gray' as const },
    no_show:   { label: 'No-show',  tone: 'amber' as const },
  }
  const { label, tone } = m[status] ?? { label: status, tone: 'gray' as const }
  return <Badge tone={tone}>{label}</Badge>
}

function CompatibilityRing({ pct }: { pct: number }) {
  const radius = 20
  const circ = 2 * Math.PI * radius
  const offset = circ - (pct / 100) * circ
  const tone = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-accent-600' : 'text-ink-400'
  return (
    <div className="relative shrink-0" aria-label={`Compatibility ${pct} percent`}>
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
  const m: Record<string, { label: string; tone: 'gray' | 'brand' | 'green' | 'amber' | 'red' }> = {
    generated:            { label: 'New match',              tone: 'brand' },
    viewed:               { label: 'Viewed',                 tone: 'gray' },
    accepted_by_talent:   { label: 'You accepted',           tone: 'green' },
    invited_by_manager:   { label: 'Hiring manager invited', tone: 'brand' },
    hr_scheduling:        { label: 'HR scheduling',          tone: 'amber' },
    interview_scheduled:  { label: 'Interview scheduled',    tone: 'green' },
    interview_completed:  { label: 'Interview complete',     tone: 'brand' },
    offer_made:           { label: 'Offer received!',        tone: 'green' },
    hired:                { label: 'Hired',                  tone: 'green' },
    cancelled:            { label: 'Cancelled',              tone: 'gray' },
    no_show:              { label: 'No-show',                tone: 'red' },
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
  if (!expiresAt) return null
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
  if (days > 10) return null

  if (days <= 0) {
    if (reviveStep === 'confirm') return (
      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-sm font-semibold text-red-800 mb-0.5">Before we reactivate your profile</p>
        <p className="text-xs text-red-600 mb-3">
          It's been a while — please confirm these details are still accurate. Matching depends on them to find the right roles.
        </p>
        <ul className="text-xs text-ink-700 space-y-1 mb-4 list-disc list-inside">
          <li>Expected salary range</li>
          <li>Preferred job types &amp; work arrangement</li>
          <li>Notice period &amp; availability</li>
          <li>Long-term career intention</li>
        </ul>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={onReviveConfirm} loading={reviving} size="sm">Yes, all current — revive</Button>
          <Link to="/talent/profile" className="btn-secondary text-xs px-3 py-1.5 rounded-md">Update first</Link>
          <button onClick={onReviveCancel} className="text-xs text-ink-400 hover:text-ink-600 px-2">Cancel</button>
        </div>
      </div>
    )
    return (
      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-red-800">Your profile has expired</p>
          <p className="text-xs text-red-600 mt-0.5">New matches are paused. Revive to start receiving opportunities again.</p>
        </div>
        <Button onClick={onReviveClick} loading={reviving} size="sm">Revive profile</Button>
      </div>
    )
  }

  if (reviveStep === 'confirm') return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <p className="text-sm font-semibold text-amber-800 mb-0.5">Quick check before extending</p>
      <p className="text-xs text-amber-600 mb-3">
        Confirm these are still accurate so matching finds you the right roles.
      </p>
      <ul className="text-xs text-ink-700 space-y-1 mb-4 list-disc list-inside">
        <li>Expected salary range</li>
        <li>Preferred job types &amp; work arrangement</li>
        <li>Notice period &amp; availability</li>
        <li>Long-term career intention</li>
      </ul>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={onReviveConfirm} loading={reviving} size="sm" variant="secondary">Yes, all current — extend 45 days</Button>
        <Link to="/talent/profile" className="btn-secondary text-xs px-3 py-1.5 rounded-md">Update first</Link>
        <button onClick={onReviveCancel} className="text-xs text-ink-400 hover:text-ink-600 px-2">Cancel</button>
      </div>
    </div>
  )

  return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-amber-800">Profile expires in {days} day{days === 1 ? '' : 's'}</p>
        <p className="text-xs text-amber-600 mt-0.5">Extend now to keep matching active.</p>
      </div>
      <Button onClick={onReviveClick} loading={reviving} size="sm" variant="secondary">Extend 45 days</Button>
    </div>
  )
}

function CareerHealthPanel({ reputation }: {
  reputation: { reputation_score: number | null; feedback_volume: number; phs_show_rate: number | null; phs_accept_rate: number | null }
}) {
  const score = reputation.reputation_score
  const scoreTone = score == null ? 'gray' : score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red'
  return (
    <Card className="mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-0.5">Career health</p>
            <p className="text-xs text-ink-400">Based on {reputation.feedback_volume} employer review{reputation.feedback_volume === 1 ? '' : 's'}</p>
          </div>
          {score != null && <Badge tone={scoreTone as 'gray' | 'green' | 'amber' | 'brand' | 'accent' | 'red'}>{Math.round(score)} / 100</Badge>}
        </div>
        <div className="flex gap-6 flex-wrap">
          {reputation.phs_show_rate != null && (
            <div>
              <p className="text-xs text-ink-500">Interview attendance</p>
              <p className="text-sm font-semibold text-ink-900">{Math.round(reputation.phs_show_rate * 100)}%</p>
            </div>
          )}
          {reputation.phs_accept_rate != null && (
            <div>
              <p className="text-xs text-ink-500">Offer acceptance</p>
              <p className="text-sm font-semibold text-ink-900">{Math.round(reputation.phs_accept_rate * 100)}%</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString()
}

const TOTAL_PROFILE_FIELDS = 12

function ProfileCompletenessBar({ gaps }: { gaps: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const filled = TOTAL_PROFILE_FIELDS - gaps.length
  const pct = Math.round((filled / TOTAL_PROFILE_FIELDS) * 100)
  const barTone = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <Card className="mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Profile completeness</p>
            <p className="text-xs text-ink-400 mt-0.5">
              {pct >= 80
                ? 'Great — your profile gives employers a strong picture.'
                : pct >= 50
                ? 'Good start — a few more details will improve your match quality.'
                : 'Complete your profile to get better-matched opportunities.'}
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
              {expanded ? 'Hide' : `${gaps.length} field${gaps.length === 1 ? '' : 's'} missing — see what to add`}
            </button>
            {expanded && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {gaps.map((g) => (
                  <span key={g} className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                    {g}
                  </span>
                ))}
                <a href="/talent/profile" className="text-xs text-brand-600 hover:text-brand-700 underline ml-1">
                  Update profile →
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
