import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface MarketRow {
  id: string
  job_title: string
  location: string | null
  experience_level: string | null
  min_salary: number | null
  max_salary: number | null
  median_salary: number | null
  currency: string
  snapshot_date: string
}

const EMPTY: Omit<MarketRow, 'id' | 'snapshot_date'> = {
  job_title: '', location: 'Kuala Lumpur', experience_level: 'mid',
  min_salary: 0, max_salary: 0, median_salary: 0, currency: 'RM',
}

export default function MarketRatePanel() {
  const [rows, setRows] = useState<MarketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Omit<MarketRow, 'id' | 'snapshot_date'>>(EMPTY)
  const [creating, setCreating] = useState(false)

  async function reload() {
    setLoading(true)
    const { data, error } = await supabase
      .from('market_rate_cache')
      .select('*').order('job_title').order('experience_level')
    if (error) setErr(error.message)
    else setRows((data ?? []) as MarketRow[])
    setLoading(false)
  }
  useEffect(() => { void reload() }, [])

  function startEdit(r: MarketRow) {
    setEditing(r.id)
    setDraft({
      job_title: r.job_title,
      location: r.location,
      experience_level: r.experience_level,
      min_salary: r.min_salary,
      max_salary: r.max_salary,
      median_salary: r.median_salary,
      currency: r.currency,
    })
  }

  async function saveEdit() {
    if (!editing) return
    const { error } = await supabase.from('market_rate_cache')
      .update({ ...draft, snapshot_date: new Date().toISOString().slice(0, 10) })
      .eq('id', editing)
    if (error) { setErr(error.message); return }
    setEditing(null)
    await reload()
  }

  async function remove(id: string) {
    if (!confirm('Delete this market rate row?')) return
    const { error } = await supabase.from('market_rate_cache').delete().eq('id', id)
    if (error) setErr(error.message)
    else await reload()
  }

  async function createRow() {
    setErr(null)
    if (!draft.job_title) { setErr('Job title required'); return }
    const { error } = await supabase.from('market_rate_cache').insert({ ...draft })
    if (error) { setErr(error.message); return }
    setCreating(false)
    setDraft(EMPTY)
    await reload()
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">
          Salary benchmarks used by the market-rate warning during role creation.
          Current dataset is <strong>Klang Valley</strong> (KL + Selangor) only;
          rows for other states still need to be seeded.
        </p>
        {!creating && !editing && (
          <button
            onClick={() => { setCreating(true); setDraft(EMPTY) }}
            className="bg-brand-600 text-white px-3 py-1 rounded text-sm hover:bg-brand-700"
          >
            + New rate
          </button>
        )}
      </div>
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}

      {creating && (
        <div className="bg-white border rounded p-3 mb-4">
          <h4 className="text-sm font-semibold mb-2">New market rate</h4>
          <RateForm draft={draft} onChange={setDraft} />
          <div className="flex gap-2 justify-end mt-3">
            <button onClick={() => { setCreating(false); setDraft(EMPTY) }}
              className="border px-3 py-1 rounded text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={() => void createRow()}
              className="bg-brand-600 text-white px-3 py-1 rounded text-sm hover:bg-brand-700">Create</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No market rates seeded.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2">Job title</th>
              <th>Location</th>
              <th>Level</th>
              <th>Min</th>
              <th>Max</th>
              <th>Median</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              editing === r.id ? (
                <tr key={r.id} className="border-b align-top">
                  <td colSpan={8} className="py-2">
                    <RateForm draft={draft} onChange={setDraft} />
                    <div className="flex gap-2 justify-end mt-2">
                      <button onClick={() => setEditing(null)}
                        className="border px-3 py-1 rounded text-xs hover:bg-gray-50">Cancel</button>
                      <button onClick={() => void saveEdit()}
                        className="bg-brand-600 text-white px-3 py-1 rounded text-xs hover:bg-brand-700">Save</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-1.5">{r.job_title}</td>
                  <td>{r.location ?? '—'}</td>
                  <td>{r.experience_level ?? '—'}</td>
                  <td>{r.min_salary ?? '—'}</td>
                  <td>{r.max_salary ?? '—'}</td>
                  <td>{r.median_salary ?? '—'}</td>
                  <td className="text-xs text-gray-500">{r.snapshot_date}</td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => startEdit(r)}
                      className="text-xs text-brand-600 hover:underline mr-2">Edit</button>
                    <button onClick={() => void remove(r.id)}
                      className="text-xs text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function RateForm({
  draft, onChange,
}: {
  draft: Omit<MarketRow, 'id' | 'snapshot_date'>
  onChange: (d: Omit<MarketRow, 'id' | 'snapshot_date'>) => void
}) {
  const set = <K extends keyof typeof draft>(k: K, v: typeof draft[K]) => onChange({ ...draft, [k]: v })
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
      <input value={draft.job_title} onChange={(e) => set('job_title', e.target.value)}
        placeholder="Job title" className="border rounded px-2 py-1 col-span-2" />
      <input value={draft.location ?? ''} onChange={(e) => set('location', e.target.value)}
        placeholder="Location" className="border rounded px-2 py-1" />
      <select value={draft.experience_level ?? 'mid'}
        onChange={(e) => set('experience_level', e.target.value)}
        className="border rounded px-2 py-1">
        <option value="entry">entry</option>
        <option value="junior">junior</option>
        <option value="mid">mid</option>
        <option value="senior">senior</option>
        <option value="lead">lead</option>
      </select>
      <input type="number" value={draft.min_salary ?? ''}
        onChange={(e) => set('min_salary', parseInt(e.target.value, 10) || 0)}
        placeholder="Min" className="border rounded px-2 py-1" />
      <input type="number" value={draft.max_salary ?? ''}
        onChange={(e) => set('max_salary', parseInt(e.target.value, 10) || 0)}
        placeholder="Max" className="border rounded px-2 py-1" />
      <input type="number" value={draft.median_salary ?? ''}
        onChange={(e) => set('median_salary', parseInt(e.target.value, 10) || 0)}
        placeholder="Median" className="border rounded px-2 py-1" />
      <input value={draft.currency} onChange={(e) => set('currency', e.target.value)}
        placeholder="Currency" className="border rounded px-2 py-1" maxLength={3} />
    </div>
  )
}
