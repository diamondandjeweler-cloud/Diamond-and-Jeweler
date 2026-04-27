import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface TagRow {
  id: string
  tag_name: string
  category: string | null
  weight_multiplier: number
  is_active: boolean
}

export default function TagPanel() {
  const [rows, setRows] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const [newCat, setNewCat] = useState<'boss_expectation' | 'talent_expectation' | 'behavioural'>('behavioural')

  useEffect(() => { void reload() }, [])

  async function reload() {
    const { data, error } = await supabase
      .from('tag_dictionary')
      .select('id, tag_name, category, weight_multiplier, is_active')
      .order('tag_name')
    if (error) setErr(error.message)
    else setRows((data ?? []) as TagRow[])
    setLoading(false)
  }

  async function addTag() {
    if (!newTag.trim()) return
    const { error } = await supabase.from('tag_dictionary').insert({
      tag_name: newTag.trim(),
      category: newCat,
      weight_multiplier: 1.0,
    })
    if (error) setErr(error.message)
    else { setNewTag(''); await reload() }
  }

  async function toggleActive(r: TagRow) {
    const { error } = await supabase
      .from('tag_dictionary')
      .update({ is_active: !r.is_active })
      .eq('id', r.id)
    if (error) setErr(error.message)
    else await reload()
  }

  if (loading) return <LoadingSpinner />
  return (
    <div>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      <div className="flex gap-2 mb-4">
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="new_tag_name"
          className="border rounded px-3 py-2 text-sm"
          aria-label="New tag name"
        />
        <select
          value={newCat}
          onChange={(e) => setNewCat(e.target.value as typeof newCat)}
          className="border rounded px-3 py-2 text-sm"
          aria-label="New tag category"
        >
          <option value="boss_expectation">boss_expectation</option>
          <option value="talent_expectation">talent_expectation</option>
          <option value="behavioural">behavioural</option>
        </select>
        <button
          onClick={() => void addTag()}
          className="bg-brand-600 text-white px-3 py-2 rounded text-sm hover:bg-brand-700"
        >
          Add tag
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => void toggleActive(r)}
            className={`text-xs px-2 py-1 rounded border ${
              r.is_active
                ? 'bg-gray-100 text-gray-800'
                : 'bg-white text-gray-400 line-through'
            }`}
            title={`Click to ${r.is_active ? 'deactivate' : 'reactivate'}`}
          >
            {r.tag_name}
            <span className="text-gray-400 ml-1">({r.category})</span>
          </button>
        ))}
      </div>
    </div>
  )
}
