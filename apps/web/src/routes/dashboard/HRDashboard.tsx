import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useSeo } from '../../lib/useSeo'
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

interface HMRow {
  id: string
  profile_id: string
  full_name: string
  job_title: string
  role_count: number
  is_self: boolean
}

interface OpenRoleRow {
  id: string
  title: string
  hm_name: string
}

type HRTab = 'scheduling' | 'link-hms'

export default function HRDashboard() {
  useSeo({ title: 'Scheduling', noindex: true })
  const navigate = useNavigate()
  const { session, refreshIsHM } = useSession()
  const [hrTab, setHrTab] = useState<HRTab>('scheduling')
  const [pending, setPending] = useState<PendingRow[]>([])
  const [scheduled, setScheduled] = useState<ScheduledRow[]>([])
  const [outcomesPending, setOutcomesPending] = useState<number>(0)
  const [hms, setHms] = useState<HMRow[]>([])
  const [openRoles, setOpenRoles] = useState<OpenRoleRow[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [format, setFormat] = useState<'video' | 'phone' | 'in_person'>('video')

  // Add-me-as-HM modal state
  const [addMeOpen, setAddMeOpen] = useState(false)
  const [addMeJobTitle, setAddMeJobTitle] = useState('')
  const [addMeBusy, setAddMeBusy] = useState(false)
  const [addMeErr, setAddMeErr] = useState<string | null>(null)
  const [justSelfRegistered, setJustSelfRegistered] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!session) return
      const userEmail = session.user.email
      const userId = session.user.id
      if (!userEmail) { setLoading(false); return }
      const { data: comp } = await supabase.from('companies').select('id').eq('primary_hr_email', userEmail).maybeSingle()
      if (!comp) { setLoading(false); return }
      setCompanyId(comp.id)

      // §1 — All hiring managers in the company, with their profile names + role counts.
      const { data: hmRows } = await supabase
        .from('hiring_managers')
        .select('id, profile_id, job_title, profiles!inner(full_name)')
        .eq('company_id', comp.id)
      const hmIds = (hmRows ?? []).map((h) => h.id)

      // Per-HM role counts (single query, group on the client).
      let roleCountMap = new Map<string, number>()
      if (hmIds.length > 0) {
        const { data: roleSlim } = await supabase
          .from('roles').select('id, hiring_manager_id').in('hiring_manager_id', hmIds)
        roleCountMap = new Map<string, number>()
        for (const r of (roleSlim ?? []) as Array<{ id: string; hiring_manager_id: string }>) {
          roleCountMap.set(r.hiring_manager_id, (roleCountMap.get(r.hiring_manager_id) ?? 0) + 1)
        }
      }

      const hmsMapped: HMRow[] = ((hmRows ?? []) as unknown as Array<{
        id: string; profile_id: string; job_title: string; profiles: { full_name: string } | null
      }>).map((h) => ({
        id: h.id,
        profile_id: h.profile_id,
        full_name: h.profiles?.full_name ?? '(unknown)',
        job_title: h.job_title,
        role_count: roleCountMap.get(h.id) ?? 0,
        is_self: h.profile_id === userId,
      }))
      if (!cancelled) setHms(hmsMapped)

      if (hmIds.length === 0) { setLoading(false); return }

      // §2 — Open roles posted by the company's HMs, with HM names.
      const { data: rolesData } = await supabase
        .from('roles')
        .select('id, title, hiring_manager_id')
        .in('hiring_manager_id', hmIds)
        .order('created_at', { ascending: false })
      const hmNameMap = new Map(hmsMapped.map((h) => [h.id, h.full_name]))
      const openRolesMapped: OpenRoleRow[] = ((rolesData ?? []) as Array<{
        id: string; title: string; hiring_manager_id: string
      }>).map((r) => ({
        id: r.id, title: r.title, hm_name: hmNameMap.get(r.hiring_manager_id) ?? '—',
      }))
      if (!cancelled) setOpenRoles(openRolesMapped)

      const roleIds = (rolesData ?? []).map((r) => r.id)
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

  async function submitAddMe(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !companyId) return
    setAddMeBusy(true); setAddMeErr(null)
    try {
      const { error } = await supabase.from('hiring_managers').insert({
        profile_id: session.user.id,
        company_id: companyId,
        job_title: addMeJobTitle.trim(),
      })
      if (error) throw error
      // Refresh both the page-local HM list and the global isHM flag (drives
      // sidebar HM links + RoleGate access to /hm routes).
      await refreshIsHM()
      const { data: comp } = await supabase.from('companies').select('id').eq('id', companyId).maybeSingle()
      if (comp) {
        const { data: hmRows } = await supabase
          .from('hiring_managers')
          .select('id, profile_id, job_title, profiles!inner(full_name)')
          .eq('company_id', companyId)
        const userId = session.user.id
        const newHms: HMRow[] = ((hmRows ?? []) as unknown as Array<{
          id: string; profile_id: string; job_title: string; profiles: { full_name: string } | null
        }>).map((h) => ({
          id: h.id, profile_id: h.profile_id,
          full_name: h.profiles?.full_name ?? '(unknown)',
          job_title: h.job_title, role_count: 0,
          is_self: h.profile_id === userId,
        }))
        setHms(newHms)
      }
      setAddMeOpen(false)
      setAddMeJobTitle('')
      setJustSelfRegistered(true)
    } catch (e2) {
      setAddMeErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setAddMeBusy(false)
    }
  }

  if (loading) return <LoadingSpinner />

  const isSelfHM = hms.some((h) => h.is_self)

  return (
    <div>
      <PageHeader
        title="HR dashboard"
        description="Manage interview scheduling and your hiring manager team."
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
      {hrTab === 'scheduling' && (<>

      {justSelfRegistered && (
        <div className="mb-6">
          <Alert tone="green">
            You&apos;re now a hiring manager too.{' '}
            <Link to="/onboarding/hm" className="underline font-medium">
              Complete your leadership profile
            </Link>{' '}
            to unlock smarter candidate matching, or jump straight to{' '}
            <Link to="/hm/post-role" className="underline font-medium">posting a role</Link>.
          </Alert>
        </div>
      )}

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

      {/* Your hiring managers */}
      <section className="mb-10">
        <SectionHeader
          title="Your hiring managers"
          subtitle="They define what each role on their team needs."
          count={hms.length}
          action={<Link to="/hr/invite" className="btn-primary btn-sm">Invite a hiring manager</Link>}
        />
        {hms.length === 0 ? (
          <Card>
            <EmptyState
              title="No hiring managers yet"
              description="Let hiring managers create the vacancy — they work with the role every day and know the right fit better than anyone else. They are the jewelers who shape the diamond."
              action={<Link to="/hr/invite" className="btn-primary">Invite your first hiring manager</Link>}
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {hms.map((h) => (
              <Card key={h.id}>
                <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base text-ink-900">
                        {h.is_self ? 'You' : h.full_name}
                      </h3>
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      {h.job_title} · {h.role_count} {h.role_count === 1 ? 'open role' : 'open roles'}
                    </div>
                  </div>
                  {h.is_self && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => navigate('/hm')}>
                        Switch to HM view
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {!isSelfHM && (
          <div className="mt-3 flex items-center gap-2 text-sm text-ink-600">
            <span>Are you also the hiring manager for your team?</span>
            <button
              type="button"
              className="underline text-brand-700 hover:text-brand-800 font-medium"
              onClick={() => { setAddMeErr(null); setAddMeOpen(true) }}
            >
              + Add me as a hiring manager
            </button>
          </div>
        )}
      </section>

      {/* Open roles */}
      <section className="mb-10">
        <SectionHeader
          title="Open roles"
          subtitle="Posted by your hiring managers. Read-only — they own role content."
          count={openRoles.length}
        />
        {openRoles.length === 0 ? (
          <Card>
            <EmptyState
              title="No open roles yet"
              description={hms.length === 0
                ? 'Once you invite hiring managers, the roles they post will appear here.'
                : 'Your hiring managers haven’t posted any roles yet.'}
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {openRoles.map((r) => (
              <Card key={r.id}>
                <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base text-ink-900">{r.title}</h3>
                    <div className="text-xs text-ink-500 mt-0.5">{r.hm_name}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Scheduling (existing logic) */}
      <section>
        <SectionHeader
          title="Schedule interviews"
          subtitle="When a hiring manager invites a candidate, schedule the interview here."
          count={pending.length + scheduled.length}
        />

      {scheduled.length > 0 && (
        <section className="mb-8">
          <SubHeader title="Upcoming interviews" count={scheduled.length} />
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
        <SubHeader title="Awaiting your scheduling" count={pending.length} />
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
      </section>
      </>)}

      {addMeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-me-hm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 id="add-me-hm-title" className="text-xl font-semibold text-ink-900">
              Add yourself as a hiring manager
            </h2>
            <p className="text-sm text-ink-700">
              You&apos;ll be added to your company&apos;s hiring-manager list and able to post roles directly.
              You can complete the leadership profile (used for matching) right after.
            </p>
            <form onSubmit={submitAddMe} className="space-y-4">
              <Input
                label="Your job title"
                value={addMeJobTitle}
                onChange={(e) => setAddMeJobTitle(e.target.value)}
                placeholder="e.g. Founder, Engineering Manager"
                required
                // Modal opens with this as the only field; focusing it is the expected behaviour.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              {addMeErr && <Alert tone="red">{addMeErr}</Alert>}
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="secondary" onClick={() => setAddMeOpen(false)} disabled={addMeBusy}>
                  Cancel
                </Button>
                <Button type="submit" loading={addMeBusy} disabled={!addMeJobTitle.trim()}>
                  Add me
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionHeader({
  title, subtitle, count, action,
}: {
  title: string
  subtitle?: string
  count?: number
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-xl text-ink-900">{title}</h2>
          {typeof count === 'number' && <span className="text-sm text-ink-400">{count}</span>}
        </div>
        {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

function SubHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 mb-4 mt-2">
      <h3 className="font-display text-lg text-ink-800">{title}</h3>
      <span className="text-sm text-ink-400">{count}</span>
    </div>
  )
}
