/**
 * Shared role-form components.
 *
 * Used by both PostRole (HM side) and TalentOnboarding (talent side) so the
 * data shapes and UX stay perfectly aligned across the two surfaces.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import { Input, Select } from '../ui'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'

/* ────────────────────────────────────────────────────────────────────────── */
/*  FormSection — collapsible wrapper                                         */
/* ────────────────────────────────────────────────────────────────────────── */

export function FormSection({
  title, description, defaultOpen = true, children,
}: {
  title: string
  description?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border border-ink-100 rounded-xl bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ink-50/40 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="font-semibold text-ink-900">{title}</div>
          {description && <div className="text-xs text-ink-500 mt-0.5">{description}</div>}
        </div>
        <svg
          width="20" height="20" viewBox="0 0 20 20" fill="none"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-5 border-t border-ink-100">
          {children}
        </div>
      )}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  SkillChipInput                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

interface SkillRow {
  slug: string
  display_en: string
  category: string
  aliases: string[]
}

export function SkillChipInput({
  value, onChange, max = 15, label, hint, placeholder = 'Type to search…',
}: {
  value: string[]
  onChange: (next: string[]) => void
  max?: number
  label?: string
  hint?: string
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [pool, setPool] = useState<SkillRow[] | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('skill_taxonomy')
      .select('slug, display_en, category, aliases')
      .order('display_en')
      .then(({ data }) => {
        if (cancelled) return
        setPool((data ?? []) as SkillRow[])
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const suggestions = useMemo(() => {
    if (!pool) return []
    const q = query.trim().toLowerCase()
    if (!q) return pool.slice(0, 12)
    const hits: SkillRow[] = []
    for (const row of pool) {
      if (value.includes(row.slug)) continue
      const name = row.display_en.toLowerCase()
      if (name.includes(q) || row.aliases.some((a) => a.toLowerCase().includes(q))) {
        hits.push(row)
        if (hits.length >= 12) break
      }
    }
    return hits
  }, [pool, query, value])

  const labelOf = useCallback((slug: string) => {
    const hit = pool?.find((r) => r.slug === slug)
    if (hit) return hit.display_en
    return slug.replace(/_/g, ' ')
  }, [pool])

  const addSlug = (slug: string) => {
    const cleaned = slug.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (!cleaned) return
    if (value.includes(cleaned)) return
    if (value.length >= max) return
    onChange([...value, cleaned])
    setQuery('')
  }

  const removeSlug = (slug: string) => onChange(value.filter((s) => s !== slug))

  return (
    <div ref={containerRef} className="space-y-2">
      {label && <div className="field-label">{label}</div>}
      {hint && <div className="field-hint">{hint}</div>}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((slug) => (
            <span
              key={slug}
              className="inline-flex items-center gap-1.5 bg-ink-900 text-white rounded-full pl-3 pr-1 py-1 text-xs"
            >
              {labelOf(slug)}
              <button
                type="button"
                onClick={() => removeSlug(slug)}
                className="rounded-full hover:bg-white/20 w-5 h-5 flex items-center justify-center"
                aria-label={`Remove ${labelOf(slug)}`}
              >×</button>
            </span>
          ))}
        </div>
      )}

      {value.length < max && (
        <div className="relative">
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowDropdown(true) }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (suggestions[0]) addSlug(suggestions[0].slug)
                else if (query.trim()) addSlug(query)
              }
            }}
            placeholder={placeholder}
          />
          {showDropdown && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-ink-200 rounded-lg shadow-lg">
              {suggestions.map((row) => (
                <button
                  key={row.slug}
                  type="button"
                  onClick={() => addSlug(row.slug)}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-ink-50 border-b border-ink-50 last:border-b-0"
                >
                  <span>{row.display_en}</span>
                  <span className="text-xs text-ink-400 ml-2">{row.category}</span>
                </button>
              ))}
              {query.trim() && !suggestions.some((s) => s.display_en.toLowerCase() === query.trim().toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => addSlug(query)}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-ink-50 text-brand-600"
                >
                  + Add custom: <strong>{query.trim()}</strong>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-ink-400">{value.length} / {max}</div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  LanguageRequirement                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export interface LanguageReq { code: string; level: 'basic' | 'conversational' | 'fluent' | 'native' }

const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: 'english',         label: 'English' },
  { value: 'bahasa_malaysia', label: 'Bahasa Malaysia' },
  { value: 'mandarin',        label: 'Mandarin' },
  { value: 'cantonese',       label: 'Cantonese' },
  { value: 'hokkien',         label: 'Hokkien' },
  { value: 'hakka',           label: 'Hakka' },
  { value: 'teochew',         label: 'Teochew' },
  { value: 'tamil',           label: 'Tamil' },
  { value: 'others',          label: 'Others' },
]

const LEVEL_OPTIONS: { value: LanguageReq['level']; label: string }[] = [
  { value: 'basic',          label: 'Basic' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'fluent',         label: 'Fluent' },
  { value: 'native',         label: 'Native' },
]

export function LanguageRequirement({
  value, onChange, label, hint, side = 'role',
}: {
  value: LanguageReq[]
  onChange: (next: LanguageReq[]) => void
  label?: string
  hint?: string
  /** "role" labels it as "Languages required"; "talent" as "Languages I speak" */
  side?: 'role' | 'talent'
}) {
  const add = () => {
    const used = new Set(value.map((v) => v.code))
    const next = LANG_OPTIONS.find((o) => !used.has(o.value))
    if (!next) return
    onChange([...value, { code: next.value, level: side === 'role' ? 'conversational' : 'fluent' }])
  }
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))
  const patch = (i: number, p: Partial<LanguageReq>) => {
    onChange(value.map((v, idx) => idx === i ? { ...v, ...p } : v))
  }

  return (
    <div className="space-y-2">
      {label && <div className="field-label">{label}</div>}
      {hint && <div className="field-hint">{hint}</div>}

      {value.length === 0 && (
        <div className="text-xs text-ink-400 italic">None added.</div>
      )}

      <div className="space-y-2">
        {value.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr,1fr,auto] gap-2 items-center">
            <Select value={row.code} onChange={(e) => patch(i, { code: e.target.value })}>
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <Select value={row.level} onChange={(e) => patch(i, { level: e.target.value as LanguageReq['level'] })}>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => remove(i)}
              className="px-2 py-1.5 text-ink-400 hover:text-red-500"
              aria-label="Remove language"
            >×</button>
          </div>
        ))}
      </div>

      {value.length < LANG_OPTIONS.length && (
        <button
          type="button"
          onClick={add}
          className="text-xs px-2.5 py-1 rounded-md border border-ink-200 text-ink-700 hover:border-ink-400 hover:text-ink-900 transition"
        >
          + Add language
        </button>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  EnvironmentFlags                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export const ENVIRONMENT_FLAGS = [
  { slug: 'standing_long_hours', label: 'Standing for long hours' },
  { slug: 'heavy_lifting',       label: 'Heavy lifting (>10kg)' },
  { slug: 'outdoor',             label: 'Outdoor work' },
  { slug: 'aircon_office',       label: 'Air-conditioned office' },
  { slug: 'noisy',               label: 'Noisy environment' },
  { slug: 'food_hygiene',        label: 'Food / hygiene compliance' },
  { slug: 'hazardous',           label: 'Hazardous materials / safety gear' },
  { slug: 'customer_facing',     label: 'Customer-facing all day' },
] as const

export function EnvironmentFlags({
  value, onChange, label, hint,
}: {
  value: string[]
  onChange: (next: string[]) => void
  label?: string
  hint?: string
}) {
  const toggle = (slug: string) =>
    onChange(value.includes(slug) ? value.filter((v) => v !== slug) : [...value, slug])

  return (
    <div className="space-y-2">
      {label && <div className="field-label">{label}</div>}
      {hint && <div className="field-hint">{hint}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ENVIRONMENT_FLAGS.map((f) => (
          <label key={f.slug} className="flex items-center gap-3 border border-ink-200 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 transition-colors">
            <input
              type="checkbox"
              checked={value.includes(f.slug)}
              onChange={() => toggle(f.slug)}
              className="h-4 w-4 rounded border-ink-300 accent-brand-500"
            />
            <span className="text-sm text-ink-800">{f.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  ScheduleBlock                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

export interface ScheduleValue {
  start_time: string  // 'HH:MM' or ''
  end_time: string
  days_per_week: number | ''
  off_day_pattern: 'weekends' | 'rotating' | 'fixed_weekday' | 'split' | 'irregular' | ''
  shift_type: 'day' | 'night' | 'rotating' | 'split' | 'flexible' | ''
}

export function ScheduleBlock({
  value, onChange,
}: {
  value: ScheduleValue
  onChange: (next: ScheduleValue) => void
}) {
  const patch = (p: Partial<ScheduleValue>) => onChange({ ...value, ...p })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Start time"
          type="time"
          value={value.start_time}
          onChange={(e) => patch({ start_time: e.target.value })}
        />
        <Input
          label="End time"
          type="time"
          value={value.end_time}
          onChange={(e) => patch({ end_time: e.target.value })}
        />
      </div>

      <Input
        label="Days per week"
        type="number"
        min={1} max={7}
        value={value.days_per_week === '' ? '' : value.days_per_week}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          patch({ days_per_week: Number.isFinite(n) ? Math.max(1, Math.min(7, n)) : '' })
        }}
        placeholder="e.g. 5"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Off-day pattern"
          value={value.off_day_pattern}
          onChange={(e) => patch({ off_day_pattern: e.target.value as ScheduleValue['off_day_pattern'] })}
        >
          <option value="">Select…</option>
          <option value="weekends">Weekends off</option>
          <option value="rotating">Rotating</option>
          <option value="fixed_weekday">Fixed weekday off</option>
          <option value="split">Split (e.g. Wed + Sun)</option>
          <option value="irregular">Irregular</option>
        </Select>
        <Select
          label="Shift type"
          value={value.shift_type}
          onChange={(e) => patch({ shift_type: e.target.value as ScheduleValue['shift_type'] })}
        >
          <option value="">Select…</option>
          <option value="day">Day</option>
          <option value="night">Night</option>
          <option value="rotating">Rotating</option>
          <option value="split">Split</option>
          <option value="flexible">Flexible</option>
        </Select>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  OpenToSelect (career-scope multi-select)                                  */
/* ────────────────────────────────────────────────────────────────────────── */

export const OPEN_TO_OPTIONS = [
  { slug: 'fresh_grad',       label: 'Fresh graduates' },
  { slug: 'career_switcher',  label: 'Career switchers' },
  { slug: 'experienced',      label: 'Experienced hires' },
  { slug: 'student',          label: 'Students (part-time)' },
  { slug: 'intern',           label: 'Interns' },
] as const

export function OpenToSelect({
  value, onChange, label, hint, side = 'role',
}: {
  value: string[]
  onChange: (next: string[]) => void
  label?: string
  hint?: string
  side?: 'role' | 'talent'
}) {
  const toggle = (slug: string) =>
    onChange(value.includes(slug) ? value.filter((v) => v !== slug) : [...value, slug])

  return (
    <div className="space-y-2">
      {label && <div className="field-label">{label}</div>}
      {hint && <div className="field-hint">{hint}</div>}
      <div className="flex flex-wrap gap-2">
        {OPEN_TO_OPTIONS.map((opt) => {
          const active = value.includes(opt.slug)
          return (
            <button
              key={opt.slug}
              type="button"
              onClick={() => toggle(opt.slug)}
              className={`text-sm px-3 py-1.5 rounded-full border transition ${
                active
                  ? 'bg-ink-900 text-white border-ink-900'
                  : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400 hover:text-ink-900'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {side === 'role' && value.length === 0 && (
        <div className="text-xs text-ink-400 italic">Empty = no restriction (all candidate types welcome).</div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  EligibilitySelect (work-authorization whitelist)                          */
/* ────────────────────────────────────────────────────────────────────────── */

export const WORK_AUTH_OPTIONS = [
  { slug: 'citizen',       label: 'Malaysian citizen' },
  { slug: 'pr',            label: 'Permanent resident' },
  { slug: 'ep',            label: 'Employment pass (EP)' },
  { slug: 'rpt',           label: 'Resident pass talent (RP-T)' },
  { slug: 'dp',            label: 'Dependant pass' },
  { slug: 'student_pass',  label: 'Student pass' },
  { slug: 'other',         label: 'Other' },
] as const

export function EligibilitySelect({
  value, onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const toggle = (slug: string) =>
    onChange(value.includes(slug) ? value.filter((v) => v !== slug) : [...value, slug])

  return (
    <div className="space-y-2">
      <div className="field-label">Legal eligibility</div>
      <div className="field-hint">
        Whitelist of work-authorization types. Leave all unchecked to use your company's default eligibility.
      </div>
      <div className="flex flex-wrap gap-2">
        {WORK_AUTH_OPTIONS.map((opt) => {
          const active = value.includes(opt.slug)
          return (
            <button
              key={opt.slug}
              type="button"
              onClick={() => toggle(opt.slug)}
              className={`text-sm px-3 py-1.5 rounded-full border transition ${
                active
                  ? 'bg-ink-900 text-white border-ink-900'
                  : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400 hover:text-ink-900'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  NonNegotiablesInput — free-text + AI-extracted chip preview               */
/* ────────────────────────────────────────────────────────────────────────── */

export interface NNAtom { type: string; value: unknown; class?: string; confidence?: number }

export function NonNegotiablesInput({
  text, atoms, onChange, side, placeholder,
}: {
  text: string
  atoms: NNAtom[]
  onChange: (next: { text: string; atoms: NNAtom[] }) => void
  side: 'hm' | 'talent'
  placeholder?: string
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function preview() {
    setErr(null)
    if (!text.trim()) return
    setBusy(true)
    try {
      const res = await callFunction<{ atoms: NNAtom[] }>('extract-non-negotiables', {
        side, text: text.trim(),
      })
      onChange({ text, atoms: res?.atoms ?? [] })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const removeAtom = (i: number) => onChange({ text, atoms: atoms.filter((_, idx) => idx !== i) })

  const defaultPh = side === 'hm'
    ? "e.g. Must have a degree with 2nd class upper.\nMust have ACCA Part II.\nNo candidates without retail background."
    : "e.g. I won't work for less than RM 8,000/month.\nI only want to work in an MNC.\nI won't work weekends, ever."

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="field-label">
          {side === 'hm' ? 'Non-negotiables (deal-breakers for this role)' : 'Your non-negotiables'}
        </div>
        <button
          type="button"
          onClick={() => void preview()}
          disabled={busy || !text.trim()}
          className="text-xs px-2.5 py-1 rounded-md border border-ink-200 text-ink-700 hover:border-ink-400 hover:text-ink-900 disabled:opacity-50 disabled:cursor-not-allowed transition"
          title={!text.trim() ? 'Type something first' : 'Parse into structured atoms'}
        >
          {busy ? 'Parsing…' : atoms.length > 0 ? 'Re-parse' : 'Parse with AI'}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => onChange({ text: e.target.value, atoms })}
        placeholder={placeholder ?? defaultPh}
        rows={5}
        className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      <div className="field-hint">
        {side === 'hm'
          ? 'These become hard filters in matching. Click "Parse" to preview which requirements the AI extracts. Delete any chip you do not want enforced.'
          : 'Stays private — only the matching engine sees this. Click "Parse" to preview the deal-breakers we extract. Delete any chip you disagree with.'}
      </div>

      {atoms.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-ink-500">Extracted requirements</div>
          <div className="flex flex-wrap gap-2">
            {atoms.map((atom, i) => (
              <span
                key={`${atom.type}-${i}`}
                className="inline-flex items-center gap-1.5 bg-brand-50 text-brand-800 border border-brand-200 rounded-full pl-3 pr-1 py-1 text-xs"
              >
                {labelAtom(atom)}
                <button
                  type="button"
                  onClick={() => removeAtom(i)}
                  className="rounded-full hover:bg-brand-200/60 w-5 h-5 flex items-center justify-center"
                  aria-label="Remove requirement"
                >×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {err && <div className="text-xs text-red-600">{err}</div>}
    </div>
  )
}

function labelAtom(atom: NNAtom): string {
  const v = atom.value as unknown
  switch (atom.type) {
    case 'salary_floor':    return `Min salary: RM ${Number(v).toLocaleString()}`
    case 'salary_ceiling':  return `Max salary: RM ${Number(v).toLocaleString()}`
    case 'min_qualification': {
      const cls = atom.class ? ` (${String(atom.class).replace(/_/g, ' ')})` : ''
      return `Min education: ${String(v)}${cls}`
    }
    case 'required_certification': return `Required cert: ${String(v).replace(/_/g, ' ')}`
    case 'company_size': return `Company size: ${(Array.isArray(v) ? v : []).join(', ')}`
    case 'industry_only': return `Industries: ${(Array.isArray(v) ? v : []).join(', ')}`
    case 'industry_exclude': return `Exclude industries: ${(Array.isArray(v) ? v : []).join(', ')}`
    case 'work_arrangement_strict': return `Must be ${String(v)}`
    case 'schedule_strict': return `Schedule: ${String(v)}`
    case 'free_text': return `Note: ${String(v).slice(0, 60)}${String(v).length > 60 ? '…' : ''}`
    default: return `${atom.type}: ${JSON.stringify(v)}`
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Available shifts (talent side, multi-select chips)                        */
/* ────────────────────────────────────────────────────────────────────────── */

export const SHIFT_OPTIONS = [
  { slug: 'day',      label: 'Day' },
  { slug: 'night',    label: 'Night' },
  { slug: 'rotating', label: 'Rotating' },
  { slug: 'split',    label: 'Split' },
  { slug: 'flexible', label: 'Flexible (any)' },
] as const

export function AvailableShifts({
  value, onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const toggle = (slug: string) =>
    onChange(value.includes(slug) ? value.filter((v) => v !== slug) : [...value, slug])

  return (
    <div className="space-y-2">
      <div className="field-label">Shifts I can work</div>
      <div className="flex flex-wrap gap-2">
        {SHIFT_OPTIONS.map((opt) => {
          const active = value.includes(opt.slug)
          return (
            <button
              key={opt.slug}
              type="button"
              onClick={() => toggle(opt.slug)}
              className={`text-sm px-3 py-1.5 rounded-full border transition ${
                active
                  ? 'bg-ink-900 text-white border-ink-900'
                  : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400 hover:text-ink-900'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
