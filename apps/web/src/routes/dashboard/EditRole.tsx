import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { updateRole } from '../../data/repositories/roles'
import { callFunction } from '../../lib/functions'
import { FormSkeleton } from '../../components/ListSkeleton'
import { useSeo } from '../../lib/useSeo'
import type { RoleRow } from '../../types/db'

const TRAITS = [
  'self_starter','reliable','collaborator','growth_minded','clear_communicator',
  'detail_oriented','adaptable','customer_focused','analytical','accountable',
]

interface GapItem {
  kind: string
  role_max?: number
  market_median?: number
  suggest_max?: number
  role_arrangement?: string
  peer_remote_pct?: number
  peer_hybrid_pct?: number
  suggest?: string
  peer_own_car_pct?: number
  peer_overtime_pct?: number
  peer_travel_pct?: number
  suggest_drop?: string
}
interface NudgeRow {
  id: string
  gap_payload: {
    peer_count?: number
    market_median?: number | null
    gaps?: GapItem[]
  } | null
  response_at: string | null
}

export default function EditRole() {
  useSeo({ title: 'Edit role', noindex: true })
  const { id } = useParams<{ id: string }>()
  const { session } = useSession()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const nudgeMode = search.get('nudge') === 'stale_3d'
  // Only auto-activate a paused onboarding draft when the caller explicitly
  // passes ?activate=1 (e.g. PostRole's "Review & activate" path).
  // The plain "Edit" link in MyRoles never passes this param, so manually-
  // paused onboarding roles are never silently reactivated by a save.
  const activateMode = search.get('activate') === '1'

  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState<RoleRow | null>(null)
  const originalRowRef = useRef<RoleRow | null>(null)
  const rowRef = useRef<RoleRow | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const savingRef = useRef(false)
  const [nudge, setNudge] = useState<NudgeRow | null>(null)
  const [appliedKinds, setAppliedKinds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!id || !session) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, hiring_manager_id, title, description, department, location, work_arrangement, experience_level, salary_min, salary_max, required_traits, status, from_onboarding')
        .eq('id', id).single()
      if (cancelled) return
      if (error) { setErr(error.message); setLoading(false); return }
      // Ownership check
      const { data: hm, error: hmErr } = await supabase.from('hiring_managers')
        .select('id').eq('id', data.hiring_manager_id).eq('profile_id', session.user.id).maybeSingle()
      if (hmErr) {
        setErr(hmErr.message)
      } else if (!hm) {
        setErr('You are not the owner of this role.')
      } else {
        setRow(data as RoleRow)
        originalRowRef.current = data as RoleRow
        rowRef.current = data as RoleRow
      }

      if (hmErr || !hm) { setLoading(false); return }

      // Stale-loop nudge banner: pull most recent open nudge for this role.
      if (nudgeMode) {
        const { data: n } = await supabase.from('stale_loop_nudges')
          .select('id, gap_payload, response_at')
          .eq('party', 'hm').eq('subject_id', id)
          .is('response_at', null)
          .order('sent_at', { ascending: false }).limit(1).maybeSingle()
        if (!cancelled && n) setNudge(n as NudgeRow)
      }

      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id, session, nudgeMode])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    // Use the ref for the latest value — covers the race where applyGap and
    // save fire in the same render cycle before React has re-rendered.
    const currentRow = rowRef.current ?? row
    if (!currentRow || savingRef.current) return
    setErr(null)
    if ((currentRow.salary_min ?? 0) > (currentRow.salary_max ?? 0)) {
      setErr('Salary min must be ≤ max.')
      return
    }
    if (currentRow.required_traits.length === 0) {
      setErr('Pick at least one trait.')
      return
    }
    savingRef.current = true
    setBusy(true)

    // Re-moderate if the text fields the classifier looks at have changed.
    // Use the snapshot from initial load — a fresh SELECT would be a TOCTOU
    // race (another session could modify the row between our read and write).
    const original = originalRowRef.current
    const textChanged = !!original && (
      original.title !== currentRow.title ||
      (original.description ?? null) !== (currentRow.description ?? null) ||
      (original.department ?? null) !== (currentRow.department ?? null)
    )

    const isDraft = activateMode && currentRow.status === 'paused' && currentRow.from_onboarding
    const { error } = await updateRole(currentRow.id, {
      title: currentRow.title,
      description: currentRow.description,
      department: currentRow.department,
      location: currentRow.location,
      work_arrangement: currentRow.work_arrangement,
      experience_level: currentRow.experience_level,
      salary_min: currentRow.salary_min,
      salary_max: currentRow.salary_max,
      required_traits: currentRow.required_traits,
      ...(isDraft ? { status: 'active' } : {}),
    })
    if (error) { setBusy(false); savingRef.current = false; setErr(error.message); return }

    void callFunction('moderate-role', { role_id: currentRow.id, force: textChanged || isDraft }).catch(() => {})
    if (isDraft) void callFunction('match-generate', { role_id: currentRow.id }).catch(() => {})

    // Record the HM's response to the stale-loop nudge so we can close the loop.
    if (nudge) {
      const kind = appliedKinds.size > 0 ? 'revised' : 'declined'
      void supabase.rpc('fn_stale_loop_record_response', {
        p_nudge_id: nudge.id,
        p_response_kind: kind,
        p_response_payload: { applied: Array.from(appliedKinds) },
      }).then(() => { /* fire-and-forget */ })
    }

    setBusy(false)
    savingRef.current = false
    navigate('/hm/roles', { replace: true })
  }

  function applyGap(g: GapItem) {
    const base = rowRef.current ?? row
    if (!base) return
    if (g.kind === 'salary_below_median' && typeof g.suggest_max === 'number') {
      const updated = { ...base, salary_max: g.suggest_max }
      setRow(updated); rowRef.current = updated
    } else if (g.kind === 'arrangement_stricter_than_peers' && g.suggest === 'hybrid') {
      const updated = { ...base, work_arrangement: 'hybrid' as RoleRow['work_arrangement'] }
      setRow(updated); rowRef.current = updated
    }
    setAppliedKinds(prev => new Set(prev).add(g.kind))
  }

  function describeGap(g: GapItem): string {
    switch (g.kind) {
      case 'salary_below_median':
        return `Salary cap RM ${g.role_max} is below the market median RM ${g.market_median}. Suggested: raise max to RM ${g.suggest_max}.`
      case 'arrangement_stricter_than_peers':
        return `Onsite-only — ${Math.round((g.peer_remote_pct ?? 0) + (g.peer_hybrid_pct ?? 0))}% of similar roles offer remote or hybrid. Suggested: switch to hybrid.`
      case 'requires_own_car_uncommon':
        return `Only ${g.peer_own_car_pct}% of similar roles require own car. Consider dropping this requirement.`
      case 'requires_overtime_uncommon':
        return `Only ${g.peer_overtime_pct}% of similar roles require overtime. Consider dropping this requirement.`
      case 'requires_travel_uncommon':
        return `Only ${g.peer_travel_pct}% of similar roles require travel. Consider dropping this requirement.`
      default:
        return 'Suggestion available.'
    }
  }

  function canApply(g: GapItem): boolean {
    return g.kind === 'salary_below_median' || g.kind === 'arrangement_stricter_than_peers'
  }

  // Edit-form shell renders immediately even while the role row is loading.
  // The form area below shows FormSkeleton until the row arrives. We still
  // surface the recoverable error UI when ownership check or fetch fails.
  if (err && !row && !loading) {
    return (
      <div className="max-w-lg mx-auto text-center">
        <p className="text-red-600 mb-4">{err}</p>
        <button onClick={() => navigate('/hm/roles')} className="bg-brand-600 text-white px-4 py-2 rounded">
          Back
        </button>
      </div>
    )
  }
  if (!row) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border rounded-lg p-6">
          <h1 className="text-2xl font-bold mb-2">Edit role</h1>
          <p className="text-sm text-ink-500 mb-6">Update the role details below.</p>
          <FormSkeleton fields={10} />
        </div>
      </div>
    )
  }

  const r = row
  const set = <K extends keyof RoleRow>(k: K, v: RoleRow[K]) => {
    const updated = { ...r, [k]: v }
    setRow(updated)
    rowRef.current = updated
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">Edit role</h1>
        {activateMode && r.from_onboarding && r.status === 'paused' ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
            This role was pre-filled from your onboarding answers. Review the details below, then click <strong>Activate role</strong> to start receiving candidates.
          </p>
        ) : (
          <p className="text-sm text-gray-600 mb-4">
            Edits apply immediately to existing matches. Status: <strong>{r.status}</strong>.
          </p>
        )}

        {nudge && nudge.gap_payload && (nudge.gap_payload.gaps?.length ?? 0) > 0 && (
          <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 mb-4">
            <h2 className="text-sm font-semibold text-blue-900 mb-1">
              3 days live — here's how this role compares
            </h2>
            <p className="text-xs text-blue-800 mb-3">
              We checked the market against {nudge.gap_payload.peer_count ?? 0} similar vacancies. Apply a suggestion to update the form, or keep your current settings.
            </p>
            <ul className="space-y-2">
              {nudge.gap_payload.gaps!.map((g, i) => {
                const applied = appliedKinds.has(g.kind)
                return (
                  <li key={i} className="flex items-start gap-3 text-sm bg-white border border-blue-100 rounded px-3 py-2">
                    <span className="flex-1 text-gray-800">{describeGap(g)}</span>
                    {canApply(g) && (
                      <button type="button" onClick={() => applyGap(g)} disabled={applied}
                        className={`text-xs px-3 py-1 rounded ${
                          applied ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}>
                        {applied ? 'Applied' : 'Apply'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

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
              {busy ? 'Saving…' : activateMode && r.from_onboarding && r.status === 'paused' ? 'Activate role' : 'Save changes'}
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
