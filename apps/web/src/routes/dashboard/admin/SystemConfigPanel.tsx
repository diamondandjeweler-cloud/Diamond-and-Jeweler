import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface ConfigRow {
  key: string
  value: unknown
  updated_at: string
}

export default function SystemConfigPanel() {
  const [rows, setRows] = useState<ConfigRow[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    const { data, error } = await supabase
      .from('system_config')
      .select('key, value, updated_at')
      .order('key')
    if (!error) {
      const list = (data ?? []) as ConfigRow[]
      setRows(list)
      const d: Record<string, string> = {}
      list.forEach((r) => { d[r.key] = JSON.stringify(r.value, null, 2) })
      setDrafts(d)
    }
    setLoading(false)
  }
  useEffect(() => { void reload() }, [])

  async function save(key: string) {
    setErrors((e) => ({ ...e, [key]: '' }))
    let parsed: unknown
    try { parsed = JSON.parse(drafts[key] ?? 'null') }
    catch (e) {
      setErrors((x) => ({ ...x, [key]: (e as Error).message }))
      return
    }
    setSavingKey(key)
    const { error } = await supabase.from('system_config').update({ value: parsed }).eq('key', key)
    setSavingKey(null)
    if (error) { setErrors((x) => ({ ...x, [key]: error.message })); return }
    await reload()
  }

  if (loading) return <LoadingSpinner />
  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Runtime-tunable platform settings. Values are JSON — see{' '}
        <code>supabase/seed.sql</code> for examples.
      </p>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.key} className="bg-white border rounded p-4">
            <div className="flex justify-between items-start">
              <div>
                <code className="text-sm font-semibold">{r.key}</code>
                <div className="text-xs text-gray-400">
                  updated {new Date(r.updated_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}
                </div>
              </div>
              <button
                onClick={() => void save(r.key)}
                disabled={savingKey === r.key || drafts[r.key] === JSON.stringify(r.value, null, 2)}
                className="text-sm bg-brand-600 text-white px-3 py-1 rounded hover:bg-brand-700 disabled:bg-gray-300"
              >
                {savingKey === r.key ? 'Saving…' : 'Save'}
              </button>
            </div>
            <textarea
              value={drafts[r.key] ?? ''}
              onChange={(e) => setDrafts((x) => ({ ...x, [r.key]: e.target.value }))}
              rows={Math.min(10, (drafts[r.key]?.split('\n').length ?? 2))}
              className="w-full border rounded px-3 py-2 mt-2 font-mono text-xs"
              spellCheck={false}
              aria-label={`Value for ${r.key}`}
            />
            {errors[r.key] && (
              <p className="text-xs text-red-600 mt-1">JSON error: {errors[r.key]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
