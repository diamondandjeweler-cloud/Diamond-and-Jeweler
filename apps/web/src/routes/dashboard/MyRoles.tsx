import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Button, Card, Badge, Alert, EmptyState, PageHeader, BadgeTone } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'

type RoleStatus = 'active' | 'paused' | 'filled' | 'expired'

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
  status: RoleStatus
  created_at: string
  vacancy_expires_at: string | null
  match_count?: number
}

export default function MyRoles() {
  useSeo({ title: 'My roles', noindex: true })
  const { session } = useSession()
  const [rows, setRows] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { if (session) void reload() }, [session])

  async function reload() {
    setLoading(true)
    const { data: hm } = await supabase.from('hiring_managers').select('id').eq('profile_id', session!.user.id).maybeSingle()
    if (!hm) { setLoading(false); return }

    const { data: roles, error } = await supabase
      .from('roles')
      .select('id, title, department, location, work_arrangement, experience_level, salary_min, salary_max, required_traits, status, created_at, vacancy_expires_at')
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
                    <span className="text-xs text-ink-500">
                      {r.match_count ?? 0} active match{(r.match_count ?? 0) === 1 ? '' : 'es'}
                    </span>
                  </div>
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

function fmt(v: number | null) { return v == null ? '—' : v.toLocaleString() }
