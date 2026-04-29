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

interface MatchRow {
  id: string
  compatibility_score: number | null
  status: string
  expires_at: string | null
  public_reasoning: PublicReasoning | null
  application_summary: string | null
  roles: { id: string; title: string; description: string | null; salary_min: number | null; salary_max: number | null; location: string | null; work_arrangement: string | null; employment_type?: string; hourly_rate?: number | null; duration_days?: number | null } | null
}

const ACTIVE = ['generated', 'viewed', 'accepted_by_talent', 'invited_by_manager', 'hr_scheduling', 'interview_scheduled', 'interview_completed']

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
  const { session, profile } = useSession()
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [extraUsed, setExtraUsed] = useState(0)
  const [unlocking, setUnlocking] = useState(false)
  const [profileExpiresAt, setProfileExpiresAt] = useState<string | null>(null)
  const [reviving, setReviving] = useState(false)
  const [talentReputation, setTalentReputation] = useState<{ reputation_score: number | null; feedback_volume: number; phs_show_rate: number | null; phs_accept_rate: number | null } | null>(null)
  const [talentFeedbackState, setTalentFeedbackState] = useState<Record<string, { rating: number; outcome: string; freeText: string; saving: boolean; saved: boolean; pointsAwarded?: number }>>({})

  useEffect(() => {
    let cancelled = false
    let talentId: string | null = null

    async function load() {
      if (!session) { setLoading(false); return }
      try {
        const { data: talent } = await supabase.from('talents').select('id, extra_matches_used, profile_expires_at, reputation_score, feedback_volume, phs_show_rate, phs_accept_rate').eq('profile_id', session.user.id).maybeSingle()
        if (cancelled) return
        if (!talent) return
        talentId = talent.id
        setExtraUsed(talent.extra_matches_used ?? 0)
        setProfileExpiresAt((talent as unknown as { profile_expires_at: string | null }).profile_expires_at ?? null)
        setTalentReputation({
          reputation_score: (talent as unknown as { reputation_score: number | null }).reputation_score ?? null,
          feedback_volume: (talent as unknown as { feedback_volume: number }).feedback_volume ?? 0,
          phs_show_rate: (talent as unknown as { phs_show_rate: number | null }).phs_show_rate ?? null,
          phs_accept_rate: (talent as unknown as { phs_accept_rate: number | null }).phs_accept_rate ?? null,
        })
        const { data, error } = await supabase
          .from('matches')
          .select('id, compatibility_score, status, expires_at, public_reasoning, application_summary, roles(id, title, description, salary_min, salary_max, location, work_arrangement, employment_type, hourly_rate, duration_days)')
          .eq('talent_id', talent.id)
          .in('status', ACTIVE)
          .order('created_at', { ascending: false })
        if (cancelled) return
        if (error) setErr(error.message)
        else setMatches((data ?? []) as unknown as MatchRow[])
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load offers')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()

    const channel = supabase
      .channel(`talent-matches-${session?.user.id ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
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
      .subscribe()

    return () => { cancelled = true; void supabase.removeChannel(channel) }
  }, [session])

  async function reviveProfile() {
    if (!session) return
    setReviving(true); setErr(null)
    try {
      const { data: t } = await supabase.from('talents').select('id').eq('profile_id', session.user.id).maybeSingle()
      if (!t) return
      const newExpiry = new Date(Date.now() + 45 * 86400000).toISOString()
      const { error } = await supabase.from('talents').update({ profile_expires_at: newExpiry, is_open_to_offers: true }).eq('id', t.id)
      if (error) throw error
      setProfileExpiresAt(newExpiry)
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
    }
  }

  if (loading) return <LoadingSpinner />

  const openCount = matches.filter((m) => ['generated', 'viewed'].includes(m.status)).length
  const inFlight  = matches.filter((m) => !['generated', 'viewed'].includes(m.status)).length

  return (
    <div>
      <PageHeader
        eyebrow={profile && `Welcome back, ${profile.full_name.split(' ')[0]}`}
        title="Your top opportunities"
        description="Up to three curated matches at a time. Accept or decline — no applications needed."
        actions={<Link to="/talent/profile" className="btn-secondary">Edit profile</Link>}
      />

      <ExpiryBanner expiresAt={profileExpiresAt} reviving={reviving} onRevive={reviveProfile} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Awaiting response" value={openCount} tone={openCount > 0 ? 'brand' : 'default'} />
        <Stat label="In progress" value={inFlight} />
        <Stat label="Total active" value={matches.length} />
        <Stat label="Slots available" value={Math.max(0, 3 - matches.length)} hint="We curate up to 3 at a time" />
      </div>

      <CareerNudgePanel side="talent" />

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
            <OfferCard key={m.id} m={m} respond={respond}
              feedbackEntry={talentFeedbackState[m.id] ?? { rating: 0, outcome: '', freeText: '', saving: false, saved: false }}
              onFeedbackChange={(patch) => setTalentFeedbackState((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? { rating: 0, outcome: '', freeText: '', saving: false, saved: false }), ...patch } }))}
              onFeedbackSubmit={() => void submitTalentFeedback(m.id)}
            />
          ))}
        </div>
      )}

      {/*
        Pay-per-extra-match CTA — hidden during pilot (2026-04-24).
        Back-end (`unlock-extra-match` Edge Function, `extra_match_purchases`
        table, `is_extra_match` flag on matches) is all deployed; just the UI
        is dormant until ToyyibPay is configured and we decide on pricing.
        To re-enable, uncomment this block.
      */}
      {false && matches.length >= 3 && extraUsed < 3 && (
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
    </div>
  )
}

function OfferCard({ m, respond, feedbackEntry, onFeedbackChange, onFeedbackSubmit }: {
  m: MatchRow
  respond: (id: string, next: 'accepted_by_talent' | 'declined_by_talent') => void
  feedbackEntry: { rating: number; outcome: string; freeText: string; saving: boolean; saved: boolean; pointsAwarded?: number }
  onFeedbackChange: (patch: Partial<{ rating: number; outcome: string; freeText: string }>) => void
  onFeedbackSubmit: () => void
}) {
  const pct = Math.round(m.compatibility_score ?? 0)
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

        <div className="mt-5 space-y-3">
          {['generated', 'viewed'].includes(m.status) && (
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => respond(m.id, 'accepted_by_talent')} size="sm">Accept</Button>
              <Button onClick={() => respond(m.id, 'declined_by_talent')} size="sm" variant="secondary">Decline</Button>
            </div>
          )}
          {m.status === 'interview_completed' && (
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
                  Save feedback (+5 pts)
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
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
  const m: Record<string, { label: string; tone: 'gray' | 'brand' | 'green' | 'amber' }> = {
    generated:            { label: 'New match',          tone: 'brand' },
    viewed:               { label: 'Viewed',             tone: 'gray' },
    accepted_by_talent:   { label: 'You accepted',       tone: 'green' },
    invited_by_manager:   { label: 'Hiring manager invited you', tone: 'brand' },
    hr_scheduling:        { label: 'HR scheduling',      tone: 'amber' },
    interview_scheduled:  { label: 'Interview scheduled', tone: 'green' },
    interview_completed:  { label: 'Interview complete', tone: 'brand' },
  }
  const entry = m[status] ?? { label: status.replace(/_/g, ' '), tone: 'gray' as const }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

function ExpiryBanner({ expiresAt, reviving, onRevive }: { expiresAt: string | null; reviving: boolean; onRevive: () => void }) {
  if (!expiresAt) return null
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
  if (days > 10) return null
  if (days <= 0) return (
    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-red-800">Your profile has expired</p>
        <p className="text-xs text-red-600 mt-0.5">New matches are paused. Revive to keep receiving opportunities and update your info so matching stays accurate.</p>
      </div>
      <Button onClick={onRevive} loading={reviving} size="sm">Revive profile</Button>
    </div>
  )
  return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-amber-800">Profile expires in {days} day{days === 1 ? '' : 's'}</p>
        <p className="text-xs text-amber-600 mt-0.5">Extend now to keep matching active. Consider updating your profile so your preferences stay current.</p>
      </div>
      <Button onClick={onRevive} loading={reviving} size="sm" variant="secondary">Extend 45 days</Button>
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
