import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Button, Card, Badge, Alert, EmptyState, PageHeader, Stat } from '../../components/ui'
import MatchExplain from '../../components/MatchExplain'
import CareerNudgePanel from '../../components/CareerNudgePanel'
import type { PublicReasoning } from '../../types/db'

interface CandidateRow {
  id: string
  compatibility_score: number | null
  status: string
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

interface WaitingInfo { roleCount: number; estimatedDays: number }
interface RoleExtraInfo { id: string; title: string; activeCount: number; extraUsed: number }

const ACTIVE = ['generated', 'viewed', 'accepted_by_talent', 'interview_completed']

export default function HMDashboard() {
  const { session, profile } = useSession()
  const [roleCount, setRoleCount] = useState<number>(0)
  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [waiting, setWaiting] = useState<WaitingInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [roleExtras, setRoleExtras] = useState<RoleExtraInfo[]>([])
  const [unlockingRoleId, setUnlockingRoleId] = useState<string | null>(null)
  const [feedbackState, setFeedbackState] = useState<Record<string, { rating: number; hired: boolean; notes: string; saving: boolean; saved: boolean }>>({})

  useEffect(() => {
    let cancelled = false
    let hmRoleIds: string[] = []

    async function load() {
      if (!session) return
      const { data: hm } = await supabase.from('hiring_managers').select('id').eq('profile_id', session.user.id).maybeSingle()
      if (!hm) { setLoading(false); return }

      const { count } = await supabase.from('roles').select('*', { count: 'exact', head: true })
        .eq('hiring_manager_id', hm.id).eq('status', 'active')
      if (!cancelled) setRoleCount(count ?? 0)

      const { data: roleRows } = await supabase.from('roles')
        .select('id, title, status, extra_matches_used')
        .eq('hiring_manager_id', hm.id)
      hmRoleIds = (roleRows ?? []).map((r) => r.id)

      const { data: matchData, error } = await supabase
        .from('matches')
        .select('id, compatibility_score, status, public_reasoning, application_summary, talents(id, privacy_mode, derived_tags, expected_salary_min, expected_salary_max), roles!inner(id, title, hiring_manager_id), match_feedback(rating, hired, notes)')
        .eq('roles.hiring_manager_id', hm.id)
        .in('status', ACTIVE)
        .order('compatibility_score', { ascending: false })
      if (cancelled) return
      if (error) setErr(error.message)
      else setCandidates((matchData ?? []) as unknown as CandidateRow[])

      // Per-role extra-match info: roles that are full (3 active) and still have
      // paid-extra quota left get an unlock CTA.
      const activeRows = ['generated','viewed','accepted_by_talent','invited_by_manager','hr_scheduling','interview_scheduled','interview_completed']
      const extras: RoleExtraInfo[] = []
      for (const r of roleRows ?? []) {
        if (r.status !== 'active') continue
        const { count: ac } = await supabase.from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('role_id', r.id).in('status', activeRows)
        extras.push({
          id: r.id,
          title: r.title,
          activeCount: ac ?? 0,
          extraUsed: r.extra_matches_used ?? 0,
        })
      }
      if (!cancelled) setRoleExtras(extras)

      // Cold-start waiting check
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
      setLoading(false)
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

    return () => { cancelled = true; void supabase.removeChannel(channel) }
  }, [session])

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
    // Optimistic update; roll back to the status captured at click time if
    // the server rejects (RLS, expired match, state-machine trigger, etc).
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
    }
  }

  async function submitFeedback(matchId: string) {
    const fb = feedbackState[matchId]
    if (!fb || fb.rating === 0) return
    setFeedbackState((s) => ({ ...s, [matchId]: { ...s[matchId], saving: true } }))
    const { error } = await supabase.from('match_feedback').upsert({
      match_id: matchId,
      rating: fb.rating,
      hired: fb.hired,
      notes: fb.notes.trim() || null,
    }, { onConflict: 'match_id' })
    setFeedbackState((s) => ({
      ...s,
      [matchId]: { ...s[matchId], saving: false, saved: !error },
    }))
    if (error) setErr(error.message)
  }

  if (loading) return <LoadingSpinner />

  const actionNeeded = candidates.filter((c) => ['generated', 'viewed', 'accepted_by_talent'].includes(c.status)).length

  return (
    <div>
      <PageHeader
        eyebrow={profile && `Hiring for ${profile.full_name.split(' ')[0]}'s team`}
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
        <Stat label="Hired (all time)" value="—" hint="Coming soon" />
      </div>

      <CareerNudgePanel side="hm" />

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}

      {waiting && (
        <div className="mb-6">
          <Alert tone="amber" title={`Cold-start: ${waiting.roleCount === 1 ? 'one role' : `${waiting.roleCount} roles`} waiting for talents`}>
            We're growing the pool. You'll be notified as soon as we have 3 candidates for each.
            Estimated wait: <strong>{waiting.estimatedDays} days</strong>.
          </Alert>
        </div>
      )}

      {candidates.length === 0 ? (
        <Card>
          <EmptyState
            title={roleCount === 0 ? 'Post your first role' : 'Curating candidates…'}
            description={roleCount === 0
              ? 'Tell us about the role you want to fill and we\'ll surface up to three candidates.'
              : 'Our engine reviews new talent every hour. You\'ll see up to 3 per role as they arrive.'}
            action={roleCount === 0 ? <Link to="/hm/post-role" className="btn-primary">Post a role</Link> : undefined}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {candidates.map((c) => (
            <CandidateCard key={c.id} row={c}
              onInvite={() => void respond(c.id, 'invited_by_manager')}
              onDecline={() => void respond(c.id, 'declined_by_manager')}
              feedbackEntry={feedbackState[c.id] ?? { rating: c.match_feedback?.[0]?.rating ?? 0, hired: c.match_feedback?.[0]?.hired ?? false, notes: c.match_feedback?.[0]?.notes ?? '', saving: false, saved: !!c.match_feedback?.[0] }}
              onFeedbackChange={(patch) => setFeedbackState((s) => ({ ...s, [c.id]: { ...( s[c.id] ?? { rating: 0, hired: false, notes: '', saving: false, saved: false }), ...patch } }))}
              onFeedbackSubmit={() => void submitFeedback(c.id)}
            />
          ))}
        </div>
      )}

      {/*
        Pay-per-extra-match CTA — hidden during pilot (2026-04-24).
        Back-end (`unlock-extra-match` Edge Function, `extra_match_purchases`
        table, `is_extra_match` on matches) is live; UI is dormant until
        ToyyibPay is configured and pricing is validated.
        To re-enable, replace `false && ` below with the original condition.
      */}
      {false && roleExtras.some((r) => r.activeCount >= 3 && r.extraUsed < 3) && (
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
                  <div key={r.id} className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3 first:border-t-0 first:pt-0">
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
    </div>
  )
}

function CandidateCard({
  row, onInvite, onDecline, feedbackEntry, onFeedbackChange, onFeedbackSubmit,
}: {
  row: CandidateRow
  onInvite: () => void
  onDecline: () => void
  feedbackEntry: { rating: number; hired: boolean; notes: string; saving: boolean; saved: boolean }
  onFeedbackChange: (patch: Partial<{ rating: number; hired: boolean; notes: string }>) => void
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

  return (
    <Card hoverable className="animate-slide-up">
      <div className="p-6">
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

        <div className="mt-4 space-y-3">
          {['generated', 'viewed', 'accepted_by_talent'].includes(row.status) && (
            <div className="flex gap-2 flex-wrap">
              <Button onClick={onInvite} size="sm">Invite to interview</Button>
              <Button onClick={onDecline} size="sm" variant="secondary">Decline</Button>
            </div>
          )}

          {/* Feedback widget — visible after interview or on any completed match */}
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
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={feedbackEntry.hired}
                  onChange={(e) => onFeedbackChange({ hired: e.target.checked })}
                  className="rounded"
                />
                <span className="text-ink-700">We hired this candidate</span>
              </label>
              <input
                type="text"
                value={feedbackEntry.notes}
                onChange={(e) => onFeedbackChange({ notes: e.target.value })}
                placeholder="Brief notes (optional)"
                className="w-full border border-ink-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
              />
              {feedbackEntry.saved ? (
                <p className="text-xs text-emerald-600 font-medium">✓ Feedback saved — helps improve future matches</p>
              ) : (
                <Button
                  size="sm"
                  onClick={onFeedbackSubmit}
                  disabled={feedbackEntry.rating === 0 || feedbackEntry.saving}
                  loading={feedbackEntry.saving}
                >
                  Save feedback
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function StatusNote({ status }: { status: string }) {
  const m: Record<string, { label: string; tone: 'gray' | 'brand' | 'green' | 'amber' }> = {
    generated:           { label: 'New candidate — awaiting your review', tone: 'brand' },
    viewed:              { label: 'Viewed — not yet actioned',            tone: 'gray' },
    accepted_by_talent:  { label: 'Talent accepted — ready for your invite', tone: 'green' },
    interview_completed: { label: 'Interview complete — submit your feedback', tone: 'amber' },
  }
  const entry = m[status] ?? { label: status.replace(/_/g, ' '), tone: 'gray' as const }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

function fmt(v: number | null | undefined): string { return v == null ? '—' : v.toLocaleString() }
