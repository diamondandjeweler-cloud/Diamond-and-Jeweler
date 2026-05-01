import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Button, Card, Badge, Alert, EmptyState, PageHeader, Stat, Input, Select } from '../../components/ui'
import LinkHMPanel from './admin/LinkHMPanel'

interface PendingRow {
  id: string
  status: string
  compatibility_score: number | null
  roles: { id: string; title: string } | null
  talents: { id: string; profile_id: string } | null
}

interface ScheduledRow {
  match_id: string
  interview_id: string
  status: string
  scheduled_at: string | null
  format: string | null
  role_title: string
  talent_id: string
  meeting_url: string | null
  meeting_provider: string | null
}

type HRTab = 'scheduling' | 'link-hms'

export default function HRDashboard() {
  const { session } = useSession()
  const [hrTab, setHrTab] = useState<HRTab>('scheduling')
  const [pending, setPending] = useState<PendingRow[]>([])
  const [scheduled, setScheduled] = useState<ScheduledRow[]>([])
  const [outcomesPending, setOutcomesPending] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [format, setFormat] = useState<'video' | 'phone' | 'in_person'>('video')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!session) return
      const userEmail = session.user.email
      if (!userEmail) { setLoading(false); return }
      const { data: comp } = await supabase.from('companies').select('id').eq('primary_hr_email', userEmail).maybeSingle()
      if (!comp) { setLoading(false); return }
      const { data: hms } = await supabase.from('hiring_managers').select('id').eq('company_id', comp.id)
      const hmIds = (hms ?? []).map((h) => h.id)
      if (hmIds.length === 0) { setLoading(false); return }
      const { data: roles } = await supabase.from('roles').select('id').in('hiring_manager_id', hmIds)
      const roleIds = (roles ?? []).map((r) => r.id)
      if (roleIds.length === 0) { setLoading(false); return }

      const [{ data: pendingData, error: pendErr }, { data: scheduledData }, { data: completedMatches }] = await Promise.all([
        supabase.from('matches')
          .select('id, status, compatibility_score, roles(id, title), talents(id, profile_id)')
          .in('role_id', roleIds).in('status', ['invited_by_manager', 'hr_scheduling'])
          .order('invited_at', { ascending: true }),
        supabase.from('interviews')
          .select('id, scheduled_at, format, status, match_id, meeting_url, meeting_provider, matches!inner(role_id, talent_id, roles(title))')
          .in('matches.role_id', roleIds).in('status', ['scheduled', 'confirmed'])
          .order('scheduled_at', { ascending: true }),
        // Outcomes pending: interviews finished but no feedback row yet from
        // either side. Counted at the matches level (not interviews) so a
        // re-scheduled interview doesn't double-count.
        supabase.from('matches')
          .select('id, match_feedback(id)')
          .in('role_id', roleIds)
          .in('status', ['interview_completed', 'hired']),
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

      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [session])

  async function completeInterview(interviewId: string, matchId: string, hired: boolean) {
    const { error: iErr } = await supabase.from('interviews').update({ status: 'completed' }).eq('id', interviewId)
    if (iErr) { setErr(iErr.message); return }
    const { error: mErr } = await supabase.from('matches')
      .update({ status: hired ? 'hired' : 'interview_completed', updated_at: new Date().toISOString() })
      .eq('id', matchId)
    if (mErr) { setErr(mErr.message); return }
    setScheduled((xs) => xs.filter((s) => s.interview_id !== interviewId))
  }

  async function scheduleInterview(matchId: string) {
    if (!scheduledAt) { setErr('Pick a date and time'); return }
    const { error: iErr } = await supabase.from('interviews').insert({
      match_id: matchId, scheduled_at: new Date(scheduledAt).toISOString(),
      format, status: 'scheduled',
    })
    if (iErr) { setErr(iErr.message); return }
    const { error: mErr } = await supabase.from('matches').update({ status: 'interview_scheduled' }).eq('id', matchId)
    if (mErr) { setErr(mErr.message); return }
    setPending((rs) => rs.filter((r) => r.id !== matchId))
    setSchedulingId(null); setScheduledAt('')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="HR dashboard"
        description="Manage interview scheduling and your hiring manager team."
        actions={<Link to="/hr/invite" className="btn-primary">Invite a hiring manager</Link>}
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-ink-200 mb-8 overflow-x-auto">
        {(['scheduling', 'link-hms'] as HRTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setHrTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              hrTab === t
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {t === 'scheduling' ? 'Scheduling' : 'Link HMs'}
          </button>
        ))}
      </div>

      {hrTab === 'link-hms' && <LinkHMPanel />}
      {hrTab === 'scheduling' && (

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <Stat label="To schedule" value={pending.length} tone={pending.length > 0 ? 'brand' : 'default'} />
        <Stat label="Upcoming interviews" value={scheduled.length} />
        <Stat
          label="Outcomes pending"
          value={outcomesPending}
          hint={outcomesPending > 0 ? 'Awaiting feedback' : undefined}
          tone={outcomesPending > 0 ? 'brand' : 'default'}
        />
      </div>

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}

      {scheduled.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="Upcoming interviews" count={scheduled.length} />
          <div className="space-y-3">
            {scheduled.map((s) => (
              <Card key={s.interview_id}>
                <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg text-ink-900">{s.role_title}</h3>
                    <div className="text-xs text-ink-500 mt-0.5">
                      Candidate #{s.talent_id.slice(0, 6).toUpperCase()} ·{' '}
                      {s.scheduled_at
                        ? new Date(s.scheduled_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })
                        : '—'}
                      {' · '}
                      <span className="capitalize">{s.format}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    {s.meeting_url ? (
                      <a href={s.meeting_url} target="_blank" rel="noopener noreferrer" className="btn-brand btn-sm">
                        Join meeting{s.meeting_provider ? ` · ${s.meeting_provider}` : ''}
                      </a>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={async () => {
                        try {
                          const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? ''
                          const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-meeting`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                            body: JSON.stringify({ interview_id: s.interview_id }),
                          })
                          const j = await r.json() as { meeting_url?: string; provider?: string; error?: string }
                          if (!r.ok) throw new Error(j.error || 'Failed')
                          setScheduled((xs) => xs.map((x) => x.interview_id === s.interview_id ? { ...x, meeting_url: j.meeting_url ?? null, meeting_provider: j.provider ?? null } : x))
                        } catch (e) {
                          setErr((e as Error).message)
                        }
                      }}>Create meeting link</Button>
                    )}
                    <Button size="sm" onClick={() => void completeInterview(s.interview_id, s.match_id, true)}>Mark hired</Button>
                    <Button size="sm" variant="secondary" onClick={() => void completeInterview(s.interview_id, s.match_id, false)}>Not hired</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader title="Awaiting your scheduling" count={pending.length} />
        {pending.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing to schedule"
              description="When a hiring manager invites a candidate, it will appear here for you to propose a time."
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <Card key={p.id}>
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg text-ink-900">{p.roles?.title}</h3>
                      <div className="text-xs text-ink-500 mt-0.5 flex items-center gap-2">
                        <span>Candidate #{p.talents?.id.slice(0, 6).toUpperCase()}</span>
                        <Badge tone="green">{Math.round(p.compatibility_score ?? 0)}% match</Badge>
                      </div>
                    </div>
                    {schedulingId !== p.id && (
                      <Button size="sm" onClick={() => setSchedulingId(p.id)}>Schedule interview</Button>
                    )}
                  </div>
                  {schedulingId === p.id && (
                    <div className="mt-5 grid md:grid-cols-3 gap-3 pt-5 border-t border-ink-100">
                      <Input label="Date & time" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                      <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
                        <option value="video">Video</option>
                        <option value="phone">Phone</option>
                        <option value="in_person">In person</option>
                      </Select>
                      <div className="flex items-end gap-2">
                        <Button onClick={() => void scheduleInterview(p.id)} className="flex-1">Confirm</Button>
                        <Button variant="secondary" onClick={() => { setSchedulingId(null); setScheduledAt('') }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <h2 className="font-display text-xl text-ink-900">{title}</h2>
      <span className="text-sm text-ink-400">{count}</span>
    </div>
  )
}
