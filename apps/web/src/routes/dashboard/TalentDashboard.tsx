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
  roles: { id: string; title: string; description: string | null; salary_min: number | null; salary_max: number | null; location: string | null; work_arrangement: string | null; employment_type?: string; hourly_rate?: number | null; duration_days?: number | null } | null
}

const ACTIVE = ['generated', 'viewed', 'accepted_by_talent', 'invited_by_manager', 'hr_scheduling', 'interview_scheduled', 'interview_completed']

export default function TalentDashboard() {
  const { session, profile } = useSession()
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [extraUsed, setExtraUsed] = useState(0)
  const [unlocking, setUnlocking] = useState(false)
  const [profileExpiresAt, setProfileExpiresAt] = useState<string | null>(null)
  const [reviving, setReviving] = useState(false)

  useEffect(() => {
    let cancelled = false
    let talentId: string | null = null

    async function load() {
      if (!session) { setLoading(false); return }
      try {
        const { data: talent } = await supabase.from('talents').select('id, extra_matches_used, profile_expires_at').eq('profile_id', session.user.id).maybeSingle()
        if (cancelled) return
        if (!talent) return
        talentId = talent.id
        setExtraUsed(talent.extra_matches_used ?? 0)
        setProfileExpiresAt((talent as unknown as { profile_expires_at: string | null }).profile_expires_at ?? null)
        const { data, error } = await supabase
          .from('matches')
          .select('id, compatibility_score, status, expires_at, public_reasoning, roles(id, title, description, salary_min, salary_max, location, work_arrangement, employment_type, hourly_rate, duration_days)')
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
          {matches.map((m) => <OfferCard key={m.id} m={m} respond={respond} />)}
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

function OfferCard({ m, respond }: { m: MatchRow; respond: (id: string, next: 'accepted_by_talent' | 'declined_by_talent') => void }) {
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

        <StatusPill status={m.status} />

        {m.roles?.employment_type && m.roles.employment_type !== 'full_time' && (
          <div className="mt-2">
            <Badge tone="accent">{m.roles.employment_type}</Badge>
            {m.roles.hourly_rate != null && (<span className="ml-2 text-xs text-ink-500">RM {Number(m.roles.hourly_rate).toFixed(2)}/hr</span>)}
            {m.roles.duration_days != null && (<span className="ml-2 text-xs text-ink-500">{m.roles.duration_days}d</span>)}
          </div>
        )}

        <MatchExplain reasoning={m.public_reasoning} />

        <div className="mt-5 flex gap-2 flex-wrap">
          {['generated', 'viewed'].includes(m.status) && (
            <>
              <Button onClick={() => respond(m.id, 'accepted_by_talent')} size="sm">Accept</Button>
              <Button onClick={() => respond(m.id, 'declined_by_talent')} size="sm" variant="secondary">Decline</Button>
            </>
          )}
          {m.status === 'interview_completed' && (
            <Link to={`/feedback/${m.id}`} className="btn-primary btn-sm">Submit interview feedback</Link>
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

function fmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString()
}
