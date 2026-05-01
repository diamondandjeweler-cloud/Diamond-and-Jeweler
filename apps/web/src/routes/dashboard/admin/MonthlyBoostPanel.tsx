import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

const ALL_CHARACTERS = ['W', 'E-', 'W+', 'W-', 'E', 'G+', 'G-', 'E+', 'F'] as const
type Character = typeof ALL_CHARACTERS[number]

function toMonthFirst(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function formatMonthLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
}

export default function MonthlyBoostPanel() {
  const now = new Date()
  const [month, setMonth] = useState(toMonthFirst(now))
  const [selected, setSelected] = useState<Character[]>([])
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Check if a submission already exists for the selected month.
  // We only fetch metadata (submitted_at) — never the encrypted characters.
  useEffect(() => {
    setSubmittedAt(null)
    setSelected([])
    setErr(null)
    setSuccess(false)
    setChecking(true)
    supabase
      .from('monthly_character_boost')
      .select('submitted_at')
      .eq('month', month)
      .maybeSingle()
      .then(({ data }) => {
        setSubmittedAt(data?.submitted_at ?? null)
        setChecking(false)
      })
  }, [month])

  function toggle(c: Character) {
    setSelected((prev) => {
      if (prev.includes(c)) return prev.filter((x) => x !== c)
      if (prev.length >= 3) return prev
      return [...prev, c]
    })
    setErr(null)
    setSuccess(false)
  }

  async function submit() {
    if (selected.length < 2) { setErr('Select at least 2 characters.'); return }
    setLoading(true)
    setErr(null)
    setSuccess(false)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setErr('Not authenticated.'); setLoading(false); return }

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-monthly-boost`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ month, characters: selected }),
      },
    )
    const body = await res.json() as { ok?: boolean; error?: string }
    if (!res.ok || !body.ok) {
      setErr(body.error ?? 'Submission failed.')
    } else {
      setSuccess(true)
      setSubmittedAt(new Date().toISOString())
      setSelected([])
    }
    setLoading(false)
  }

  // Month picker: current month ± 1
  const months = [-1, 0, 1].map((offset) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    return toMonthFirst(d)
  })

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Monthly character boost</h2>
        <p className="text-xs text-gray-500">
          Select 2–3 characters to prioritise in matching for the chosen month.
          Submit on the 1st of the month. Previous selections are not shown for security.
        </p>
      </div>

      {/* Month selector */}
      <div className="flex gap-2">
        {months.map((m) => (
          <button
            key={m}
            onClick={() => setMonth(m)}
            className={`flex-1 border rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              month === m
                ? 'bg-brand-500 text-white border-brand-500'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {formatMonthLabel(m)}
          </button>
        ))}
      </div>

      {/* Existing submission notice */}
      {checking ? (
        <p className="text-xs text-gray-400">Checking…</p>
      ) : submittedAt ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <strong>Already submitted</strong> for {formatMonthLabel(month)}{' '}
          on {new Date(submittedAt).toLocaleString('en-MY')}.{' '}
          You can overwrite by selecting new characters below.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
          No submission yet for {formatMonthLabel(month)}.
        </div>
      )}

      {/* Character grid */}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">
          Select 2–3 characters{' '}
          <span className={selected.length >= 3 ? 'text-amber-600' : 'text-gray-400'}>
            ({selected.length}/3)
          </span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ALL_CHARACTERS.map((c) => {
            const active = selected.includes(c)
            const disabled = !active && selected.length >= 3
            return (
              <button
                key={c}
                onClick={() => toggle(c)}
                disabled={disabled}
                className={`border rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                    : disabled
                      ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {c}
              </button>
            )
          })}
        </div>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}
      {success && (
        <p className="text-xs text-green-700 font-medium">
          ✓ Boost submitted for {formatMonthLabel(month)}.
        </p>
      )}

      <button
        onClick={() => void submit()}
        disabled={selected.length < 2 || loading}
        className="w-full bg-brand-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-brand-600 disabled:opacity-40 transition-colors"
      >
        {loading ? 'Submitting…' : `Submit boost for ${formatMonthLabel(month)}`}
      </button>
    </div>
  )
}
