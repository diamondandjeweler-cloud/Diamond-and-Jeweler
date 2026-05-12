import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Button, Card, Badge, Alert, EmptyState, PageHeader, BadgeTone } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'

type RoleStatus = 'active' | 'paused' | 'filled' | 'expired'
type ModerationStatus = 'pending' | 'approved' | 'flagged' | 'rejected'

interface RoleRow {
  id: string
  title: string
  department: string | null
  location: string | null
  work_arrangement: string | null
  experience_level: string | null
  salary_min: number | null
  salary_max: number | null
  required_traits: string[]
  required_skills: string[] | null
  headcount: number | null
  min_education_level: string | null
  start_urgency: string | null
  open_to: string[] | null
  languages_required: Array<{ code: string; level: string }> | null
  status: RoleStatus
  created_at: string
  vacancy_expires_at: string | null
  moderation_status: ModerationStatus
  moderation_reason: string | null
  moderation_appealed_at: string | null
  moderation_reviewed_at: string | null
  match_count?: number
}

export default function MyRoles() {
  useSeo({ title: 'My roles', noindex: true })
  const { session } = useSession()
  const [rows, setRows] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [appeal, setAppeal] = useState<{ role: RoleRow; text: string; busy: boolean; err: string | null } | null>(null)

  async function submitAppeal() {
    if (!appeal) return
    const text = appeal.text.trim()
    if (text.length < 10) {
      setAppeal({ ...appeal, err: 'Please write at least 10 characters explaining the role.' })
      return
    }
    setAppeal({ ...appeal, busy: true, err: null })
    const { error } = await supabase.rpc('appeal_role_moderation', {
      p_role_id: appeal.role.id,
      p_appeal_text: text,
    })
    if (error) {
      setAppeal({ ...appeal, busy: false, err: error.message })
      return
    }
    setAppeal(null)
    await reload()
  }

  // reload uses `session` and is intentionally only refired when it changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (session) void reload() }, [session])

  async function reload() {
    setLoading(true)
    const { data: hm } = await supabase.from('hiring_managers').select('id').eq('profile_id', session!.user.id).maybeSingle()
    if (!hm) { setLoading(false); return }

    const { data: roles, error } = await supabase
      .from('roles')
      .select('id, title, department, location, work_arrangement, experience_level, salary_min, salary_max, required_traits, required_skills, headcount, min_education_level, start_urgency, open_to, languages_required, status, created_at, vacancy_expires_at, moderation_status, moderation_reason, moderation_appealed_at, moderation_reviewed_at')
      .eq('hiring_manager_id', hm.id)
      .order('created_at', { ascending: false })
    if (error) { setErr(error.message); setLoading(false); return }

    const roleList = (roles ?? []) as RoleRow[]
    const withCounts = await Promise.all(roleList.map(async (r) => {
      const { count } = await supabase.from('matches').select('id', { count: 'exact', head: true })
        .eq('role_id', r.id)
        .in('status', ['generated', 'viewed', 'accepted_by_talent', 'invited_by_manager', 'hr_scheduling', 'interview_scheduled'])
      return { ...r, match_count: count ?? 0 }
    }))
    setRows(withCounts)
    setLoading(false)
  }

  async function setStatus(id: string, next: RoleStatus) {
    const prev = rows.find((r) => r.id === id)?.status
    setRows((xs) => xs.map((r) => (r.id === id ? { ...r, status: next } : r)))
    const { error } = await supabase.from('roles').update({ status: next }).eq('id', id)
    if (error) {
      setErr(error.message)
      setRows((xs) => xs.map((r) => (r.id === id ? { ...r, status: prev ?? r.status } : r)))
      return
    }
    if (next === 'active') {
      try { await callFunction('match-generate', { role_id: id }) } catch (e) {
        setErr('Role activated but match generation failed — our team will retry shortly.')
      }
    }
  }

  async function extendVacancy(id: string) {
    const newExpiry = new Date(Date.now() + 45 * 86400000).toISOString()
    setRows((xs) => xs.map((r) => (r.id === id ? { ...r, vacancy_expires_at: newExpiry } : r)))
    const { error } = await supabase.from('roles').update({ vacancy_expires_at: newExpiry }).eq('id', id)
    if (error) { setErr(error.message) }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="My roles"
        description="Every role you've posted. Pause to stop curation, reopen to resume matching."
        actions={<Link to="/hm/post-role" className="btn-primary">Post a role</Link>}
      />

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}

      {appeal && (
        <div className="fixed inset-0 z-50 p-4 flex items-center justify-center">
          <button
            type="button"
            aria-label="Close appeal dialog"
            disabled={appeal.busy}
            onClick={() => setAppeal(null)}
            className="absolute inset-0 bg-black/40 cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="appeal-modal-title"
            className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6"
          >
            <h3 id="appeal-modal-title" className="text-lg font-semibold text-ink-900 mb-1">
              Appeal moderation decision
            </h3>
            <p className="text-sm text-ink-600 mb-3">
              Our reviewer will look at this within 1 business day. Be specific — license
              numbers, registration details, or context that explains why the role is legitimate.
            </p>
            {appeal.role.moderation_reason && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-900 mb-3">
                <strong>System reason:</strong> {appeal.role.moderation_reason}
              </div>
            )}
            <textarea
              rows={5}
              value={appeal.text}
              onChange={(e) => setAppeal({ ...appeal, text: e.target.value, err: null })}
              maxLength={2000}
              disabled={appeal.busy}
              placeholder="e.g. We are SC-licensed financial advisors (CMSL/A0123). The 'investment' wording refers to our licensed unit-trust distribution business…"
              className="w-full text-sm border border-ink-200 rounded p-2 mb-2"
            />
            <p className="text-xs text-ink-400 mb-3 text-right">{appeal.text.length} / 2000</p>
            {appeal.err && <p className="text-sm text-red-600 mb-2">{appeal.err}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAppeal(null)} disabled={appeal.busy}>
                Cancel
              </Button>
              <Button onClick={() => void submitAppeal()} loading={appeal.busy}>
                Submit appeal
              </Button>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No roles yet"
            description="Post your first role to start receiving candidates."
            action={<Link to="/hm/post-role" className="btn-primary">Post your first role</Link>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} hoverable>
              <div className="p-5 flex flex-wrap gap-4 justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <h3 className="font-display text-lg text-ink-900">{r.title}</h3>
                    <StatusBadge status={r.status} />
                    <ModerationBadge status={r.moderation_status} />
                    <span className="text-xs text-ink-500">
                      {r.match_count ?? 0} active match{(r.match_count ?? 0) === 1 ? '' : 'es'}
                    </span>
                  </div>
                  <ModerationNotice
                    role={r}
                    onAppeal={() => setAppeal({ role: r, text: '', busy: false, err: null })}
                  />
                  <p className="text-sm text-ink-600">
                    {[r.department, r.location, r.work_arrangement, r.experience_level].filter(Boolean).join(' · ')}
                  </p>
                  {(r.salary_min || r.salary_max) && (
                    <p className="text-sm text-ink-700 mt-0.5">
                      RM {fmt(r.salary_min)} – {fmt(r.salary_max)}
                      <span className="text-ink-400"> / month</span>
                    </p>
                  )}
                  {r.required_traits.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {r.required_traits.map((t) => (
                        <span key={t} className="text-xs bg-ink-100 text-ink-700 px-2 py-0.5 rounded-md">
                          {t.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                  <RoleStructuredSummary role={r} />
                  <VacancyExpiry expiresAt={r.vacancy_expires_at} status={r.status} />
                </div>
                <div className="flex gap-1.5 whitespace-nowrap">
                  <Link to={`/hm/roles/${r.id}/edit`} className="btn-secondary btn-sm">Edit</Link>
                  {r.status === 'active' && (
                    <Button size="sm" variant="ghost" onClick={() => void setStatus(r.id, 'paused')}>Pause</Button>
                  )}
                  {r.status === 'paused' && (
                    <Button size="sm" onClick={() => void setStatus(r.id, 'active')}>Reopen</Button>
                  )}
                  {r.status !== 'filled' && r.status !== 'expired' && (
                    <Button size="sm" variant="ghost" onClick={() => void setStatus(r.id, 'filled')}>Mark filled</Button>
                  )}
                  {r.status === 'active' && r.vacancy_expires_at &&
                    Math.ceil((new Date(r.vacancy_expires_at).getTime() - Date.now()) / 86400000) <= 10 && (
                    <Button size="sm" variant="secondary" onClick={() => void extendVacancy(r.id)}>Extend</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function RoleStructuredSummary({ role }: { role: RoleRow }) {
  const bits: string[] = []
  if (role.headcount && role.headcount > 1) bits.push(`Headcount ${role.headcount}`)
  if (role.min_education_level) bits.push(`Min: ${role.min_education_level}`)
  if (role.start_urgency) bits.push(role.start_urgency.replace(/_/g, ' '))
  const langs = Array.isArray(role.languages_required) ? role.languages_required : []
  if (langs.length > 0) bits.push(`Langs: ${langs.map((l) => l.code).join(', ')}`)
  const skills = Array.isArray(role.required_skills) ? role.required_skills : []
  if (skills.length > 0) bits.push(`${skills.length} skill${skills.length === 1 ? '' : 's'}`)
  const openTo = Array.isArray(role.open_to) ? role.open_to : []
  if (openTo.length > 0) bits.push(`Open to: ${openTo.map((s) => s.replace(/_/g, ' ')).join(', ')}`)
  if (bits.length === 0) return null
  return (
    <p className="text-xs text-ink-500 mt-2">
      {bits.join(' · ')}
    </p>
  )
}

function VacancyExpiry({ expiresAt, status }: { expiresAt: string | null; status: RoleStatus }) {
  if (!expiresAt || status !== 'active') return null
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
  if (days <= 0) return <p className="text-xs text-red-600 mt-1.5">Vacancy expired — matching paused</p>
  if (days <= 10) return <p className="text-xs text-amber-600 mt-1.5">Vacancy expires in {days} day{days === 1 ? '' : 's'}</p>
  return null
}

function StatusBadge({ status }: { status: RoleStatus }) {
  const tone: Record<RoleStatus, BadgeTone> = {
    active: 'green', paused: 'amber', filled: 'brand', expired: 'gray',
  }
  return <Badge tone={tone[status]}>{status}</Badge>
}

function ModerationBadge({ status }: { status: ModerationStatus }) {
  if (status === 'approved') return null
  const map: Record<ModerationStatus, { tone: BadgeTone; label: string }> = {
    pending:  { tone: 'gray',  label: 'Under review' },
    flagged:  { tone: 'amber', label: 'Awaiting human review' },
    rejected: { tone: 'red',   label: 'Blocked' },
    approved: { tone: 'green', label: 'Approved' },
  }
  const { tone, label } = map[status]
  return <Badge tone={tone}>{label}</Badge>
}

function ModerationNotice({ role, onAppeal }: { role: RoleRow; onAppeal: () => void }) {
  if (role.moderation_status === 'approved') return null
  const isAppealed = !!role.moderation_appealed_at && !role.moderation_reviewed_at
  const canAppeal = (role.moderation_status === 'rejected' || role.moderation_status === 'flagged') && !isAppealed

  return (
    <div className={`mt-2 mb-1 text-xs rounded-md border px-3 py-2 ${
      role.moderation_status === 'rejected'
        ? 'bg-red-50 border-red-200 text-red-800'
        : role.moderation_status === 'flagged'
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-ink-50 border-ink-200 text-ink-700'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          {role.moderation_status === 'pending' && (
            <p>Your role is being screened by our compliance system. This usually takes under a minute.</p>
          )}
          {role.moderation_status === 'flagged' && (
            <p>
              Our automated system flagged this role for human review. Matching is paused until
              an admin approves it.
              {role.moderation_reason && <span className="block mt-1 italic">"{role.moderation_reason}"</span>}
            </p>
          )}
          {role.moderation_status === 'rejected' && (
            <p>
              This role was blocked because it appears to violate our policy on illegal or
              fraudulent postings.
              {role.moderation_reason && <span className="block mt-1 italic">"{role.moderation_reason}"</span>}
            </p>
          )}
          {isAppealed && (
            <p className="mt-1 font-medium">Appeal submitted — pending admin review.</p>
          )}
        </div>
        {canAppeal && (
          <button
            onClick={onAppeal}
            className="shrink-0 text-xs px-2.5 py-1 bg-white border border-current rounded hover:bg-ink-50"
          >
            Appeal
          </button>
        )}
      </div>
    </div>
  )
}

function fmt(v: number | null) { return v == null ? '—' : v.toLocaleString() }
