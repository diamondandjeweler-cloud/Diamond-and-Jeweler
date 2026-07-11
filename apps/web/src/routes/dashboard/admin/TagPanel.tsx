import { useEffect, useState } from 'react'
import { insertTag, listTags, setTagActive } from '../../../data/repositories/tagDictionary'
import ListSkeleton from '../../../components/ListSkeleton'
import { Tooltip } from '../../../ui'

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
    const { data, error } = await listTags()
    if (error) setErr(error.message)
    else setRows(data ?? [])
    setLoading(false)
  }

  async function addTag() {
    if (!newTag.trim()) return
    const { error } = await insertTag({
      tag_name: newTag.trim(),
      category: newCat,
      weight_multiplier: 1.0,
    })
    if (error) setErr(error.message)
    else { setNewTag(''); await reload() }
  }

  async function toggleActive(r: TagRow) {
    const { error } = await setTagActive(r.id, !r.is_active)
    if (error) setErr(error.message)
    else await reload()
  }

  if (loading) return <ListSkeleton rows={6} variant="row" />
  return (
    <div>
      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      <div className="flex gap-2 mb-4">
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="new_tag_name"
          className="border dark:border-border rounded px-3 py-2 text-sm"
          aria-label="New tag name"
        />
        <select
          value={newCat}
          onChange={(e) => setNewCat(e.target.value as typeof newCat)}
          className="border dark:border-border rounded px-3 py-2 text-sm"
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
          <Tooltip key={r.id} content={`Click to ${r.is_active ? 'deactivate' : 'reactivate'}`}>
            <button
              onClick={() => void toggleActive(r)}
              className={`text-xs px-2 py-1 rounded border dark:border-border ${
                r.is_active
                  ? 'bg-surface-2 text-gray-800 dark:text-fg'
                  : 'bg-surface text-fg-subtle line-through'
              }`}
            >
              {r.tag_name}
              <span className="text-fg-subtle ml-1">({r.category})</span>
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
