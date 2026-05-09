import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useSeo } from '../../lib/useSeo'
import { getDisplayName } from '../../lib/displayName'
import { formatError } from '../../lib/errors'
import { Button, Card, Badge, Alert, EmptyState, PageHeader, Stat } from '../../components/ui'
import MatchExplain from '../../components/MatchExplain'
import ScreeningChecklist from '../../components/ScreeningChecklist'
import CareerNudgePanel from '../../components/CareerNudgePanel'
import AddHmDobModal from '../../components/AddHmDobModal'
import type { PublicReasoning, CultureComparison } from '../../types/db'

const HM_OUTCOMES = [
  { value: '', label: 'Select outcome (optional)' },
  { value: 'great_hire',       label: '🏆 Great hire — still with us' },
  { value: 'good_interview',   label: '✅ Good interview, no offer made' },
  { value: 'offer_declined',   label: '🔄 Candidate declined offer' },
  { value: 'hired_left_early', label: '⚠️ Hired but left within 3 months' },
  { value: 'poor_interview',   label: '⬇️ Poor interview performance' },
  { value: 'no_show',          label: '❌ No-show — did not attend' },
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

interface InterviewRound {
  id: string
  round_number: number
  scheduled_at: string
  interview_url: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  hm_notes: string | null
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
  useSeo({ title: 'Candidates', noindex: true })
  const { t } = useTranslation()
  const { session, profile } = useSession()
  const [roleCount, setRoleCount] = useState<number>(0)
  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [waiting, setWaiting] = useState<WaitingInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [roleExtras, setRoleExtras] = useState<RoleExtraInfo[]>([])
  const [unlockingRoleId, setUnlockingRoleId] = useState<string | null>(null)
  const [urgentRoleId, setUrgentRoleId] = useState<string | null>(null)
  const [urgentBusy, setUrgentBusy] = useState(false)
  const [urgentMsg, setUrgentMsg] = useState<{ tone: 'green' | 'amber' | 'red'; text: React.ReactNode } | null>(null)
  const [pointsBalance, setPointsBalance] = useState<number | null>(null)
  const URGENT_COST = 9
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

  // Interview flow state
  const [roundsByMatch, setRoundsByMatch] = useState<Record<string, InterviewRound[]>>({})
  const [contactByMatch, setContactByMatch] = useState<Record<string, ContactInfo | null>>({})
  const [schedulingFor, setSchedulingFor] = useState<string | null>(null)
  const [scheduleAt, setScheduleAt] = useState('')
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const loadRounds = useCallback(async (matchIds: string[]) => {
    if (matchIds.length === 0) return
    const { data } = await supabase
      .from('interview_rounds')
      .select('id, match_id, round_number, scheduled_at, interview_url, status, hm_notes')
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
    let hmRoleIds: string[] = []
    // Watchdog: if any Supabase query stalls (no response, no error), the
    // try/catch never fires and the spinner hangs forever. Force-clear loading
    // after 12s so the user sees an error instead of an indefinite spinner.
    let watchdog: ReturnType<typeof setTimeout> | null = null

    async function load() {
      if (!session) { setLoading(false); return }
      watchdog = setTimeout(() => {
        if (cancelled) return
        console.error('[hm-dashboard] load watchdog tripped — a Supabase query stalled')
        setErr('Loading timed out — please refresh.')
        setLoading(false)
      }, 12000)
      try {
      const { data: hm } = await supabase.from('hiring_managers').select('id, company_id, reputation_score, feedback_volume, phs_offer_accept_rate, hm_quality_factor, hm_cancel_rate, date_of_birth_encrypted').eq('profile_id', session.user.id).maybeSingle()
      if (!hm) { setLoading(false); return }
      if (!cancelled) {
        setHmId((hm as unknown as { id: string }).id)
        setHmHasDob((hm as unknown as { date_of_birth_encrypted: string | null }).date_of_birth_encrypted != null)
      }
      if ((hm as unknown as { company_id: string | null }).company_id) {
        const cid = (hm as unknown as { company_id: string }).company_id
        if (!cancelled) setCompanyId(cid)
        const { data: co } = await supabase.from('companies').select('verified').eq('id', cid).maybeSingle()
        if (!cancelled) setCompanyVerified(co?.verified ?? false)
      } else {
        if (!cancelled) setCompanyVerified(false)
        // Check for a pending link request.
        const { data: linkReq } = await supabase
          .from('company_hm_link_requests')
          .select('id, companies(name)')
          .eq('hm_id', hm.id)
          .eq('status', 'pending')
          .maybeSingle()
        if (!cancelled && linkReq) {
          const co = linkReq.companies as unknown as { name: string } | null
          setLinkRequest({ id: linkReq.id, companyName: co?.name ?? 'a company' })
        }
      }
      if (!cancelled) setHmReputation({
        reputation_score: (hm as unknown as { reputation_score: number | null }).reputation_score ?? null,
        feedback_volume: (hm as unknown as { feedback_volume: number }).feedback_volume ?? 0,
        phs_offer_accept_rate: (hm as unknown as { phs_offer_accept_rate: number | null }).phs_offer_accept_rate ?? null,
        hm_quality_factor: (hm as unknown as { hm_quality_factor: number | null }).hm_quality_factor ?? null,
        hm_cancel_rate: (hm as unknown as { hm_cancel_rate: number | null }).hm_cancel_rate ?? null,
      })

      const { count } = await supabase.from('roles').select('*', { count: 'exact', head: true })
        .eq('hiring_manager_id', hm.id).eq('status', 'active')
      if (!cancelled) setRoleCount(count ?? 0)

      const { data: pointsRow } = await supabase.from('profiles')
        .select('points').eq('id', session.user.id).maybeSingle()
      if (!cancelled) setPointsBalance(pointsRow?.points ?? 0)

      const { data: roleRows } = await supabase.from('roles')
        .select('id, title, status, extra_matches_used')
        .eq('hiring_manager_id', hm.id)
        .limit(200)
      hmRoleIds = (roleRows ?? []).map((r) => r.id)

      if (hmRoleIds.length > 0) {
        const { count: hiredCount } = await supabase.from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'hired')
          .in('role_id', hmRoleIds)
        if (!cancelled) setHiredAllTime(hiredCount ?? 0)
      }

      const { data: matchData, error } = await supabase
        .from('matches')
        .select('id, compatibility_score, status, is_urgent, public_reasoning, application_summary, talents(id, privacy_mode, derived_tags, expected_salary_min, expected_salary_max), roles!inner(id, title, hiring_manager_id), match_feedback(rating, hired, notes)')
        .eq('roles.hiring_manager_id', hm.id)
        .in('status', ACTIVE)
        .order('is_urgent', { ascending: false })
        .order('compatibility_score', { ascending: false })
      if (cancelled) return
      if (error) setErr(error.message)
      else {
        const rows = (matchData ?? []) as unknown as CandidateRow[]
        setCandidates(rows)
        // Load rounds for interview-stage matches
        const interviewMatchIds = rows
          .filter((r) => ['invited_by_manager', 'interview_scheduled', 'interview_completed', 'offer_made'].includes(r.status))
          .map((r) => r.id)
        await loadRounds(interviewMatchIds)
      }

      const activeRows = ['generated','viewed','accepted_by_talent','invited_by_manager','hr_scheduling','interview_scheduled','interview_completed']
      const activeRoleIds = (roleRows ?? []).filter((r) => r.status === 'active').map((r) => r.id)
      if (activeRoleIds.length > 0) {
        const { data: activeCounts } = await supabase.from('matches')
          .select('role_id')
          .in('role_id', activeRoleIds)
          .in('status', activeRows)
        const countByRole: Record<string, number> = {}
        for (const m of activeCounts ?? []) {
          countByRole[m.role_id] = (countByRole[m.role_id] ?? 0) + 1
        }
        const extras: RoleExtraInfo[] = (roleRows ?? [])
          .filter((r) => r.status === 'active')
          .map((r) => ({ id: r.id, title: r.title, activeCount: countByRole[r.id] ?? 0, extraUsed: r.extra_matches_used ?? 0 }))
        if (!cancelled) setRoleExtras(extras)
      }

      if (hmRoleIds.length > 0) {
        const { data: coldRows } = await supabase.from('cold_start_queue').select('role_id')
          .in('role_id', hmRoleIds).eq('status', 'pending')
        if (!cancelled && coldRows && coldRows.length > 0) {
          const [{ data: cfg }, { data: talentCountResp }] = await Promise.all([
            supabase.from('system_config').select('value').eq('key', 'waiting_period_thresholds').maybeSingle(),
            supabase.rpc('active_talent_count'),
          ])
          const thresholds = (cfg?.value as Array<{ min_talents: number; max_talents: number; days: number }> | undefined) ?? []
          const n = typeof talentCountResp === 'number' ? talentCountResp : 0
          const band = thresholds.find((t) => n >= t.min_talents && n < t.max_talents)
          if (!cancelled) setWaiting({ roleCount: coldRows.length, estimatedDays: band?.days ?? 14 })
        }
      }
      if (watchdog) { clearTimeout(watchdog); watchdog = null }
      setLoading(false)
      } catch (e) {
        if (watchdog) { clearTimeout(watchdog); watchdog = null }
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Failed to load. Please refresh.')
          setLoading(false)
        }
      }
    }
    void load()

    const channel = supabase
      .channel(`hm-matches-${session?.user.id ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        const next = payload.new as { id: string; role_id?: string; status?: string } | null
        const prev = payload.old as { id: string; role_id?: string } | null
        const touched = next?.role_id ?? prev?.role_id
        if (!touched || !hmRoleIds.includes(touched)) return
        if (payload.eventType === 'DELETE') setCandidates((xs) => xs.filter((c) => c.id !== prev?.id))
        else if (payload.eventType === 'UPDATE' && next) setCandidates((xs) => xs.map((c) => (c.id === next.id ? { ...c, ...next } : c)))
        else if (payload.eventType === 'INSERT') void load()
      })
      .subscribe()

    return () => {
      cancelled = true
      if (watchdog) clearTimeout(watchdog)
      void supabase.removeChannel(channel)
    }
  }, [session, loadRounds])

  async function handleUrgentSearch(roleId: string) {
    setUrgentMsg(null); setErr(null)
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
    if (!window.confirm(`Spend ${URGENT_COST} Diamond Points to instantly surface 1 top candidate for this role?`)) return
    setUrgentRoleId(roleId); setUrgentBusy(true)
    try {
      const res = await callFunction<{
        success: boolean
        cost: number
        balance_after: number
        result: { kind: 'match'; match_id: string; talent_id: string; compatibility_score: number | null } | null
        message?: string
      }>('urgent-priority-search', { request_type: 'find_worker', role_id: roleId })
      if (typeof res.balance_after === 'number') setPointsBalance(res.balance_after)
      if (!res.result) {
        setUrgentMsg({ tone: 'amber', text: res.message ?? 'No candidate found right now.' })
      } else {
        setUrgentMsg({
          tone: 'green',
          text: `Urgent candidate ready (${Math.round(res.result.compatibility_score ?? 0)}% match) — highlighted below. Balance: ${res.balance_after} Diamond Points.`,
        })
      }
    } catch (e) {
      setUrgentMsg({ tone: 'red', text: e instanceof Error ? e.message : 'Urgent search failed.' })
    } finally {
      setUrgentBusy(false); setUrgentRoleId(null)
    }
  }

  async function handleUnlockExtra(roleId: string) {
    setErr(null); setUnlockingRoleId(roleId)
    try {
      const res = await callFunction<{ paymentUrl: string }>('unlock-extra-match', {
        match_type: 'hm_extra', role_id: roleId,
      })
      if (res?.paymentUrl) window.location.href = res.paymentUrl
      else setErr('Could not start payment')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to start payment')
    } finally { setUnlockingRoleId(null) }
  }

  async function respond(id: string, next: 'invited_by_manager' | 'declined_by_manager') {
    if (next === 'invited_by_manager' && companyVerified === false) {
      setErr('Company verification required before inviting candidates to interview.')
      return
    }
    const prevStatus = candidates.find((c) => c.id === id)?.status
    setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, status: next } : c)))
    const { error } = await supabase.from('matches').update({
      status: next,
      invited_at: next === 'invited_by_manager' ? new Date().toISOString() : null,
    }).eq('id', id)
    if (error) {
      setErr(error.message)
      if (prevStatus) {
        setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, status: prevStatus } : c)))
      }
      return
    }
    const event_type = next === 'invited_by_manager' ? 'accept_interview' : 'reject_with_reason'
    try { await callFunction('award-points', { event_type, match_id: id }) } catch { /* tolerate */ }
  }

  async function doAction(matchId: string, action: string, extra?: Record<string, unknown>) {
    if (['schedule_round', 'make_offer', 'mark_hired'].includes(action) && companyVerified === false) {
      setErr('Company verification required before proceeding with interviews.')
      return
    }
    setErr(null)
    setActionBusy(`${matchId}:${action}`)
    try {
      await callFunction('interview-action', { action, match_id: matchId, ...extra })
      // Refresh match row and rounds
      const { data: updated } = await supabase
        .from('matches')
        .select('id, compatibility_score, status, is_urgent, public_reasoning, application_summary, talents(id, privacy_mode, derived_tags, expected_salary_min, expected_salary_max), roles!inner(id, title, hiring_manager_id), match_feedback(rating, hired, notes)')
        .eq('id', matchId)
        .maybeSingle()
      if (updated) setCandidates((cs) => cs.map((c) => (c.id === matchId ? (updated as unknown as CandidateRow) : c)))
      await loadRounds([matchId])
      if (action === 'schedule_round') {
        setSchedulingFor(null)
        setScheduleAt('')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Action failed: ${action}`)
    } finally {
      setActionBusy(null)
    }
  }

  async function revealContact(matchId: string) {
    if (companyVerified === false) {
      setErr('Company verification required before revealing candidate contact details.')
      return
    }
    setErr(null)
    try {
      const { data, error } = await supabase.rpc('get_talent_contact', { p_match_id: matchId })
      if (error) { setErr(error.message); return }
      const row = Array.isArray(data) ? data[0] : data
      setContactByMatch((prev) => ({ ...prev, [matchId]: row ?? null }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not retrieve contact')
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
      setFeedbackState((s) => ({
        ...s,
        [matchId]: { ...s[matchId], saving: false, saved: true, pointsAwarded: result?.points_awarded ?? 0 },
      }))
    } catch (e) {
      setFeedbackState((s) => ({ ...s, [matchId]: { ...s[matchId], saving: false } }))
      setErr(e instanceof Error ? e.message : 'Failed to save feedback')
    }
  }

  if (loading) return <LoadingSpinner />

  const actionNeeded = candidates.filter((c) => ['generated', 'viewed', 'accepted_by_talent'].includes(c.status)).length

  async function respondToLinkRequest(action: 'accept' | 'decline') {
    if (!linkRequest) return
    setLinkBusy(true)
    try {
      await callFunction('link-hm', { request_id: linkRequest.id, action })
      setLinkRequest(null)
      if (action === 'accept') window.location.reload()
    } catch (e) {
      setErr(formatError(e))
    }
    setLinkBusy(false)
  }

  return (
    <div>
      {/* Pending company link request banner */}
      {linkRequest && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-900">
              {linkRequest.companyName} wants to add you to their team
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Accepting will link your profile under their company umbrella. You can still manage your own roles.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={linkBusy} loading={linkBusy} onClick={() => void respondToLinkRequest('accept')}>
              Accept
            </Button>
            <Button size="sm" variant="secondary" disabled={linkBusy} onClick={() => void respondToLinkRequest('decline')}>
              Decline
            </Button>
          </div>
        </div>
      )}

      <PageHeader
        eyebrow={profile && t('dashboard.hmGreeting', { name: getDisplayName(profile) })}
        title="Your candidates"
        description="Curated shortlists for your active roles. Invite to interview or decline — up to three per role."
        actions={
          <>
            <Link to="/hm/roles" className="btn-secondary">My roles</Link>
            <Link to="/hm/post-role" className="btn-primary">Post a role</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Active roles" value={roleCount} />
        <Stat label="Candidates" value={candidates.length} />
        <Stat label="Awaiting you" value={actionNeeded} tone={actionNeeded > 0 ? 'brand' : 'default'} />
        <Stat label="Hired (all time)" value={hiredAllTime} />
      </div>

      <CareerNudgePanel side="hm" />

      {hmReputation && hmReputation.feedback_volume > 0 && (
        <EmployerReputationPanel reputation={hmReputation} />
      )}

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}

      {hmHasDob === false && (
        <div className="mb-6">
          <Alert tone="amber" title="Add a little more about you to start matching">
            We&apos;re missing your date of birth — without it we can&apos;t pitch you to the right
            talent. Takes 10 seconds. Encrypted, never shown to candidates.
            <div className="mt-2">
              <Button size="sm" onClick={() => setShowAddDobModal(true)}>Add now</Button>
            </div>
          </Alert>
        </div>
      )}

      {companyVerified === false && companyId && (
        <div className="mb-6">
          <Alert tone="amber" title="Company verification pending">
            You can post roles and receive matches freely. To invite a candidate to interview or reveal contact details,
            your HR Admin needs to complete company verification first.{' '}
            <a
              href={`/onboarding/company/verify?company=${companyId}`}
              className="font-semibold underline"
              target="_blank"
              rel="noreferrer"
            >
              Share this link with your HR Admin
            </a>
            {' '}to upload your SSM certificate and business license.
          </Alert>
        </div>
      )}

      {waiting && (
        <div className="mb-6">
          <Alert tone="amber" title={`Cold-start: ${waiting.roleCount === 1 ? 'one role' : `${waiting.roleCount} roles`} waiting for talents`}>
            We're growing the pool. You'll be notified as soon as we have 3 candidates for each.
            Estimated wait: <strong>{waiting.estimatedDays} days</strong>.
          </Alert>
        </div>
      )}

      {/* Schedule round modal */}
      {schedulingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-4">Schedule interview round</h2>
            <label htmlFor="hm-schedule-at" className="block text-sm mb-1 text-ink-700">Date & time (MYT)</label>
            <input
              id="hm-schedule-at"
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="flex gap-3">
              <Button
                disabled={!scheduleAt || actionBusy !== null}
                loading={actionBusy === `${schedulingFor}:schedule_round`}
                onClick={() => void doAction(schedulingFor, 'schedule_round', {
                  scheduled_at: new Date(scheduleAt).toISOString(),
                })}
              >
                Confirm
              </Button>
              <Button variant="secondary" onClick={() => { setSchedulingFor(null); setScheduleAt('') }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {candidates.length === 0 ? (
        <Card>
          <EmptyState
            title={roleCount === 0 ? 'Post your first role' : 'Curating candidates…'}
            description={roleCount === 0
              ? 'Tell us about the role you want to fill and we\'ll surface up to three candidates.'
              : 'Our engine reviews new talent every hour. You\'ll see up to 3 per role as they arrive. If 24h passes with nothing, try widening the salary range or removing one required trait.'}
            action={roleCount === 0 ? <Link to="/hm/post-role" className="btn-primary">Post a role</Link> : undefined}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              row={c}
              rounds={roundsByMatch[c.id] ?? []}
              contact={contactByMatch[c.id]}
              actionBusy={actionBusy}
              schedulingFor={schedulingFor}
              onInvite={() => void respond(c.id, 'invited_by_manager')}
              onDecline={() => void respond(c.id, 'declined_by_manager')}
              onScheduleRound={() => setSchedulingFor(c.id)}
              onCompleteInterviews={() => void doAction(c.id, 'complete_interviews')}
              onMakeOffer={() => void doAction(c.id, 'make_offer')}
              onMarkHired={() => void doAction(c.id, 'mark_hired')}
              onCancel={() => void doAction(c.id, 'cancel_match')}
              onRevealContact={() => void revealContact(c.id)}
              feedbackEntry={feedbackState[c.id] ?? { rating: c.match_feedback?.[0]?.rating ?? 0, hired: c.match_feedback?.[0]?.hired ?? false, notes: c.match_feedback?.[0]?.notes ?? '', outcome: '', freeText: '', saving: false, saved: !!c.match_feedback?.[0] }}
              onFeedbackChange={(patch) => setFeedbackState((s) => ({ ...s, [c.id]: { ...(s[c.id] ?? { rating: 0, hired: false, notes: '', outcome: '', freeText: '', saving: false, saved: false }), ...patch } }))}
              onFeedbackSubmit={() => void submitFeedback(c.id)}
            />
          ))}
        </div>
      )}

      {roleExtras.length > 0 && (
        <Card className="mt-8 border-2 border-amber-400 bg-amber-50/40">
          <div className="p-6">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-sm font-semibold text-amber-900 mb-0.5">
                  🔥 Urgent Priority Search — {URGENT_COST} Diamond Points
                </div>
                <p className="text-sm text-ink-600">
                  Skip the queue and surface the single best candidate for a role on the spot.
                </p>
              </div>
              {pointsBalance != null && (
                <div className="text-xs text-ink-600 whitespace-nowrap">
                  Balance: <span className="font-semibold text-ink-900">{pointsBalance} Diamond Points</span>
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
                    <div className="text-xs text-ink-500">{r.activeCount} active candidate{r.activeCount === 1 ? '' : 's'}</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void handleUrgentSearch(r.id)}
                    disabled={urgentBusy}
                  >
                    {urgentBusy && urgentRoleId === r.id ? 'Searching…' : `Urgent — ${URGENT_COST} Diamond Points`}
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
            <div className="text-sm font-medium text-ink-900 mb-1">Need more candidates?</div>
            <p className="text-sm text-ink-500 mb-4">
              Each role fills up to 3 curated candidates for free. You can unlock up to 3 more per role at RM 9.90 each.
            </p>
            <div className="space-y-2">
              {roleExtras
                .filter((r) => r.activeCount >= 3 && r.extraUsed < 3)
                .map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3 first:border-t-0 first:pt-0">
                    <div>
                      <div className="text-sm font-medium text-ink-900">{r.title}</div>
                      <div className="text-xs text-ink-500">{3 - r.extraUsed} extra unlock{3 - r.extraUsed === 1 ? '' : 's'} remaining</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void handleUnlockExtra(r.id)}
                      disabled={unlockingRoleId === r.id}
                    >
                      {unlockingRoleId === r.id ? 'Starting payment…' : 'Unlock — RM 9.90'}
                    </Button>
                  </div>
                ))}
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
  row, rounds, contact, actionBusy, schedulingFor,
  onInvite, onDecline,
  onScheduleRound, onCompleteInterviews, onMakeOffer, onMarkHired, onCancel, onRevealContact,
  feedbackEntry, onFeedbackChange, onFeedbackSubmit,
}: {
  row: CandidateRow
  rounds: InterviewRound[]
  contact: ContactInfo | null | undefined
  actionBusy: string | null
  schedulingFor: string | null
  onInvite: () => void
  onDecline: () => void
  onScheduleRound: () => void
  onCompleteInterviews: () => void
  onMakeOffer: () => void
  onMarkHired: () => void
  onCancel: () => void
  onRevealContact: () => void
  feedbackEntry: { rating: number; hired: boolean; notes: string; outcome: string; freeText: string; saving: boolean; saved: boolean; pointsAwarded?: number }
  onFeedbackChange: (patch: Partial<{ rating: number; hired: boolean; notes: string; outcome: string; freeText: string }>) => void
  onFeedbackSubmit: () => void
}) {
  const displayName = row.talents?.privacy_mode === 'anonymous'
    ? 'Anonymous candidate'
    : `Candidate #${row.talents?.id.slice(0, 6).toUpperCase()}`

  const topTags = Object.entries(row.talents?.derived_tags ?? {})
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
            🔥 Urgent Match
          </div>
        )}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-display text-lg text-ink-900 mb-0.5">{displayName}</h3>
            <p className="text-sm text-ink-500">for {row.roles?.title ?? 'role'}</p>
          </div>
          <Badge tone={tone}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="4" /></svg>
            {pct}% match
          </Badge>
        </div>

        <div className="bg-ink-50 rounded-lg p-3 mb-4 text-sm">
          <div className="text-xs text-ink-500 uppercase tracking-wide mb-0.5">Expects</div>
          <div className="text-ink-900 font-medium">
            RM {fmt(row.talents?.expected_salary_min)} – {fmt(row.talents?.expected_salary_max)}
            <span className="text-ink-400 font-normal"> / month</span>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">Why hire for this role</p>
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

        {/* Interview rounds panel */}
        {rounds.length > 0 && (
          <div className="mt-4 border border-ink-100 rounded-lg overflow-hidden">
            <div className="bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-600 uppercase tracking-wide">
              Interview rounds
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
                      className="text-xs text-brand-600 hover:text-brand-700 underline"
                    >
                      Join
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
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-2">Candidate contact details</p>
            {contact === undefined ? (
              <Button size="sm" onClick={onRevealContact}>Reveal contact info</Button>
            ) : contact === null ? (
              <p className="text-xs text-red-600">Could not load contact.</p>
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
              <Button onClick={onInvite} size="sm">Invite to interview</Button>
              <Button onClick={onDecline} size="sm" variant="secondary">Decline</Button>
            </div>
          )}

          {/* Stage 2: invited / scheduling */}
          {['invited_by_manager', 'hr_scheduling', 'interview_scheduled'].includes(row.status) && (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={onScheduleRound}
                disabled={schedulingFor === row.id || actionBusy !== null}
              >
                {rounds.length === 0 ? 'Schedule interview' : 'Add next round'}
              </Button>
              {row.status === 'interview_scheduled' && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy('complete_interviews')}
                  disabled={actionBusy !== null}
                  onClick={onCompleteInterviews}
                >
                  Mark all done
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                loading={busy('cancel_match')}
                disabled={actionBusy !== null}
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Stage 3: interview done */}
          {row.status === 'interview_completed' && (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                loading={busy('make_offer')}
                disabled={actionBusy !== null}
                onClick={onMakeOffer}
              >
                Make offer
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy('cancel_match')}
                disabled={actionBusy !== null}
                onClick={onCancel}
              >
                Decline candidate
              </Button>
            </div>
          )}

          {/* Stage 4: offer out */}
          {row.status === 'offer_made' && (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                loading={busy('mark_hired')}
                disabled={actionBusy !== null}
                onClick={onMarkHired}
              >
                Confirm hired
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy('cancel_match')}
                disabled={actionBusy !== null}
                onClick={onCancel}
              >
                Cancel offer
              </Button>
            </div>
          )}

          {/* Feedback widget */}
          {['interview_completed', 'offer_made', 'hired', 'declined_by_manager', 'declined_by_talent'].includes(row.status) && (
            <div className="border border-ink-200 rounded-lg p-3 space-y-2 bg-ink-50">
              <p className="text-xs font-semibold text-ink-700 uppercase tracking-wide">
                Rate this match
              </p>
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
                {HM_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <textarea
                value={feedbackEntry.freeText}
                onChange={(e) => onFeedbackChange({ freeText: e.target.value })}
                placeholder="What stood out? Your notes train the matching engine (optional)"
                rows={2}
                className="w-full border border-ink-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white resize-none"
              />
              {feedbackEntry.saved ? (
                <p className="text-xs text-emerald-600 font-medium">
                  ✓ Feedback saved{feedbackEntry.pointsAwarded ? ` — +${feedbackEntry.pointsAwarded} Diamond Points` : ' — helps improve future matches'}
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
    scheduled:  { label: 'Scheduled', tone: 'brand' as const },
    completed:  { label: 'Done',      tone: 'green' as const },
    cancelled:  { label: 'Cancelled', tone: 'gray' as const },
    no_show:    { label: 'No-show',   tone: 'amber' as const },
  }
  const { label, tone } = m[status] ?? { label: status, tone: 'gray' as const }
  return <Badge tone={tone}>{label}</Badge>
}

function StatusNote({ status }: { status: string }) {
  const m: Record<string, { label: string; tone: 'gray' | 'brand' | 'green' | 'amber' | 'red' }> = {
    generated:            { label: 'New candidate — awaiting your review',         tone: 'brand' },
    viewed:               { label: 'Viewed — not yet actioned',                    tone: 'gray' },
    accepted_by_talent:   { label: 'Talent accepted — ready for your invite',      tone: 'green' },
    invited_by_manager:   { label: 'Invited — schedule an interview round',        tone: 'brand' },
    hr_scheduling:        { label: 'HR is coordinating the schedule',              tone: 'amber' },
    interview_scheduled:  { label: 'Interview scheduled — join your Jitsi link',   tone: 'brand' },
    interview_completed:  { label: 'Interview complete — make an offer or decline', tone: 'amber' },
    offer_made:           { label: 'Offer sent — awaiting candidate response',     tone: 'amber' },
    hired:                { label: 'Hired',                                        tone: 'green' },
    cancelled:            { label: 'Cancelled',                                    tone: 'gray' },
    no_show:              { label: 'No-show',                                      tone: 'red' },
  }
  const entry = m[status] ?? { label: status.replace(/_/g, ' '), tone: 'gray' as const }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

function CultureCompare({ comparison }: { comparison: CultureComparison }) {
  if (comparison.talent_top_wants.length === 0 && comparison.hm_top_offers.length === 0) return null
  return (
    <div className="mt-3 border border-ink-100 rounded-lg p-3 bg-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-2">Culture alignment</p>
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
          {comparison.overlap.length > 0 && <span className="mr-3">✓ aligned with your team</span>}
          {comparison.talent_only.length > 0 && <span>~ talent wants this — confirm in interview</span>}
        </p>
      )}
    </div>
  )
}

function EmployerReputationPanel({ reputation }: {
  reputation: { reputation_score: number | null; feedback_volume: number; phs_offer_accept_rate: number | null; hm_quality_factor: number | null; hm_cancel_rate: number | null }
}) {
  const score = reputation.reputation_score
  const scoreTone = score == null ? 'gray' : score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red'
  const qf = reputation.hm_quality_factor
  const qfTone = qf == null ? 'gray' : qf >= 0.90 ? 'green' : qf >= 0.80 ? 'amber' : 'red'
  return (
    <Card className="mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-0.5">Employer reputation</p>
            <p className="text-xs text-ink-400">Based on {reputation.feedback_volume} talent review{reputation.feedback_volume === 1 ? '' : 's'}</p>
          </div>
          {score != null && <Badge tone={scoreTone as 'gray' | 'green' | 'amber' | 'brand' | 'accent' | 'red'}>{Math.round(score)} / 100</Badge>}
        </div>
        <div className="flex gap-6 flex-wrap">
          {qf != null && (
            <div>
              <p className="text-xs text-ink-500">Reliability score</p>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-ink-900">{(qf * 100).toFixed(0)} / 100</p>
                <Badge tone={qfTone as 'gray' | 'green' | 'amber' | 'brand' | 'accent' | 'red'} className="text-xs">
                  {qf >= 0.90 ? 'Excellent' : qf >= 0.80 ? 'Good' : 'Needs attention'}
                </Badge>
              </div>
              <p className="text-xs text-ink-400 mt-0.5">Factors into how your roles are ranked to talent</p>
            </div>
          )}
          {reputation.hm_cancel_rate != null && (
            <div>
              <p className="text-xs text-ink-500">Interview cancel rate</p>
              <p className="text-sm font-semibold text-ink-900">{Math.round(reputation.hm_cancel_rate * 100)}%</p>
            </div>
          )}
          {reputation.phs_offer_accept_rate != null && (
            <div>
              <p className="text-xs text-ink-500">Offer accept rate</p>
              <p className="text-sm font-semibold text-ink-900">{Math.round(reputation.phs_offer_accept_rate * 100)}%</p>
            </div>
          )}
        </div>
        {qf != null && qf < 0.80 && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Your reliability score affects how your roles rank in matching. To improve it: show up to scheduled interviews, ensure JDs are accurate, and follow through on offers.
          </div>
        )}
      </div>
    </Card>
  )
}

function fmt(v: number | null | undefined): string { return v == null ? '—' : v.toLocaleString() }
