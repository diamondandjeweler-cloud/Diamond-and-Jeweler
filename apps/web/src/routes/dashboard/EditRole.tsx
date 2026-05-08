import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useSeo } from '../../lib/useSeo'

const TRAITS = [
  'self_starter','reliable','collaborator','growth_minded','clear_communicator',
  'detail_oriented','adaptable','customer_focused','analytical','accountable',
]

interface RoleRow {
  id: string
  hiring_manager_id: string
  title: string
  description: string | null
  department: string | null
  location: string | null
  work_arrangement: 'remote' | 'hybrid' | 'onsite' | null
  experience_level: 'entry' | 'junior' | 'mid' | 'senior' | 'lead' | null
  salary_min: number | null
  salary_max: number | null
  required_traits: string[]
  status: 'active' | 'paused' | 'filled' | 'expired'
}

export default function EditRole() {
  useSeo({ title: 'Edit role', noindex: true })
  const { id } = useParams<{ id: string }>()
  const { session } = useSession()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState<RoleRow | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id || !session) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, hiring_manager_id, title, description, department, location, work_arrangement, experience_level, salary_min, salary_max, required_traits, status')
        .eq('id', id).single()
      if (cancelled) return
      if (error) setErr(error.message)
      else {
        // Ownership check
        const { data: hm } = await supabase.from('hiring_managers')
          .select('id').eq('id', data.hiring_manager_id).eq('profile_id', session.user.id).maybeSingle()
        if (!hm) {
          setErr('You are not the owner of this role.')
        } else {
          setRow(data as RoleRow)
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id, session])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!row) return
    setErr(null)
    if ((row.salary_min ?? 0) > (row.salary_max ?? 0)) {
      setErr('Salary min must be ≤ max.')
      return
    }
    if (row.required_traits.length === 0) {
      setErr('Pick at least one trait.')
      return
    }
    setBusy(true)

    // Re-moderate if the text fields the classifier looks at have changed.
    const { data: original } = await supabase.from('roles')
      .select('title, description, industry, department').eq('id', row.id).single()
    const textChanged = !!original && (
      original.title !== row.title ||
      (original.description ?? null) !== (row.description ?? null) ||
      (original.department ?? null) !== (row.department ?? null)
    )

    const { error } = await supabase.from('roles').update({
      title: row.title,
      description: row.description,
      department: row.department,
      location: row.location,
      work_arrangement: row.work_arrangement,
      experience_level: row.experience_level,
      salary_min: row.salary_min,
      salary_max: row.salary_max,
      required_traits: row.required_traits,
    }).eq('id', row.id)
    if (error) { setBusy(false); setErr(error.message); return }

    if (textChanged) {
      void callFunction('moderate-role', { role_id: row.id, force: true }).catch(() => {})
    }

    setBusy(false)
    navigate('/hm/roles', { replace: true })
  }

  if (loading) return <LoadingSpinner />
  if (err && !row) {
    return (
      <div className="max-w-lg mx-auto text-center">
        <p className="text-red-600 mb-4">{err}</p>
        <button onClick={() => navigate('/hm/roles')} className="bg-brand-600 text-white px-4 py-2 rounded">
          Back
        </button>
      </div>
    )
  }
  if (!row) return null

  const r = row
  const set = <K extends keyof RoleRow>(k: K, v: RoleRow[K]) => setRow({ ...r, [k]: v })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">Edit role</h1>
        <p className="text-sm text-gray-600 mb-4">
          Edits apply immediately to existing matches. Status: <strong>{r.status}</strong>.
        </p>

        <form onSubmit={save} className="space-y-4">
          <Field label="Title" required>
            <input value={r.title} onChange={(e) => set('title', e.target.value)}
              className="w-full border rounded px-3 py-2" required />
          </Field>
          <Field label="Description">
            <textarea value={r.description ?? ''} onChange={(e) => set('description', e.target.value)}
              rows={4} className="w-full border rounded px-3 py-2" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Department">
              <input value={r.department ?? ''} onChange={(e) => set('department', e.target.value)}
                className="w-full border rounded px-3 py-2" />
            </Field>
            <Field label="Location">
              <input value={r.location ?? ''} onChange={(e) => set('location', e.target.value)}
                className="w-full border rounded px-3 py-2" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Work arrangement">
              <select value={r.work_arrangement ?? 'hybrid'}
                onChange={(e) => set('work_arrangement', e.target.value as RoleRow['work_arrangement'])}
                className="w-full border rounded px-3 py-2">
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </Field>
            <Field label="Experience level">
              <select value={r.experience_level ?? 'mid'}
                onChange={(e) => set('experience_level', e.target.value as RoleRow['experience_level'])}
                className="w-full border rounded px-3 py-2">
                <option value="entry">Entry</option>
                <option value="junior">Junior</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Salary min (RM)">
              <input type="number" min={0} value={r.salary_min ?? ''}
                onChange={(e) => set('salary_min', parseInt(e.target.value, 10) || null)}
                className="w-full border rounded px-3 py-2" />
            </Field>
            <Field label="Salary max (RM)">
              <input type="number" min={0} value={r.salary_max ?? ''}
                onChange={(e) => set('salary_max', parseInt(e.target.value, 10) || null)}
                className="w-full border rounded px-3 py-2" />
            </Field>
          </div>
          <div>
            <div id="edit-role-traits-label" className="block text-sm mb-2">
              Required traits <span className="text-red-500">*</span>
            </div>
            <div role="group" aria-labelledby="edit-role-traits-label" className="flex flex-wrap gap-2">
              {TRAITS.map((t) => {
                const on = r.required_traits.includes(t)
                const atCap = !on && r.required_traits.length >= 5
                return (
                  <button key={t} type="button" disabled={atCap}
                    onClick={() =>
                      set('required_traits', on
                        ? r.required_traits.filter((x) => x !== t)
                        : [...r.required_traits, t])
                    }
                    className={`text-sm px-3 py-1 rounded border ${
                      on ? 'bg-brand-600 text-white border-brand-600'
                         : atCap ? 'bg-gray-100 text-gray-400'
                         : 'bg-white hover:bg-gray-50'
                    }`}>
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <div className="flex gap-2 justify-between pt-2">
            <button type="button" onClick={() => navigate('/hm/roles')}
              className="px-4 py-2 border rounded hover:bg-gray-50" disabled={busy}>
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:bg-gray-300">
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}
