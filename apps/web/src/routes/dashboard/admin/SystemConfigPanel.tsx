import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface ConfigRow {
  key: string
  value: unknown
  updated_at: string
}

// Keys that hold credentials must never round-trip through the UI.
// They live in Vercel/Supabase env vars and are read server-side only.
function isSecretKey(key: string): boolean {
  const k = key.toLowerCase()
  return /(token|secret|api[_-]?key|password|webhook|private[_-]?key|signing[_-]?key)/.test(k)
}

// Keys that affect platform-wide behaviour. Save flow shows a confirm()
// dialog naming the key + new value to prevent fat-finger production
// changes (e.g. flipping launch_mode to private during business hours).
const HIGH_RISK_KEYS = new Set<string>([
  'launch_mode',
  'match_approval_mode',
  'match_expiry_days',
  'free_matches_quota',
  'extra_match_price_rm',
  'points_per_extra_match',
  'urgent_search_cost',
  'urgent_search_daily_cap',
  'cold_start_auto_switch_threshold',
  'legal_version',
  'legal_reviewed',
])

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
    if (HIGH_RISK_KEYS.has(key)) {
      const display = JSON.stringify(parsed)
      const ok = confirm(
        `High-risk config change.\n\nKey: ${key}\nNew value: ${display}\n\n` +
        `This affects platform-wide behaviour and takes effect immediately for all users. Proceed?`,
      )
      if (!ok) return
    }
    setSavingKey(key)
    const { error } = await supabase.from('system_config').update({ value: parsed }).eq('key', key)
    setSavingKey(null)
    if (error) {
      console.error('[SystemConfigPanel] save failed:', error)
      setErrors((x) => ({ ...x, [key]: 'Save failed — check the browser console for details.' }))
      return
    }
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
        {rows.map((r) => {
          const secret = isSecretKey(r.key)
          return (
            <div key={r.key} className="bg-white border rounded p-4">
              <div className="flex justify-between items-start">
                <div>
                  <code className="text-sm font-semibold">{r.key}</code>
                  {secret && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                      Secret · managed externally
                    </span>
                  )}
                  {!secret && HIGH_RISK_KEYS.has(r.key) && (
                    <span
                      className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-100 px-1.5 py-0.5 rounded"
                      title="Saving this key prompts a confirm dialog because it affects platform-wide behaviour."
                    >
                      High risk · confirms on save
                    </span>
                  )}
                  <div className="text-xs text-gray-400">
                    updated {new Date(r.updated_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}
                  </div>
                </div>
                {!secret && (
                  <button
                    onClick={() => void save(r.key)}
                    disabled={savingKey === r.key || drafts[r.key] === JSON.stringify(r.value, null, 2)}
                    className="text-sm bg-brand-600 text-white px-3 py-1 rounded hover:bg-brand-700 disabled:bg-gray-300"
                  >
                    {savingKey === r.key ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
              {secret ? (
                <p className="mt-2 text-xs text-ink-600 bg-ink-50 border border-ink-200 rounded px-3 py-2">
                  This value holds a credential. To prevent admin-to-admin secret reads it is not editable here —
                  set it via the Vercel / Supabase env or directly in SQL with the service role.
                </p>
              ) : (
                <textarea
                  value={drafts[r.key] ?? ''}
                  onChange={(e) => setDrafts((x) => ({ ...x, [r.key]: e.target.value }))}
                  rows={Math.min(10, (drafts[r.key]?.split('\n').length ?? 2))}
                  className="w-full border rounded px-3 py-2 mt-2 font-mono text-xs"
                  spellCheck={false}
                  aria-label={`Value for ${r.key}`}
                />
              )}
              {errors[r.key] && (
                <p className="text-xs text-red-600 mt-1">{errors[r.key]}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
