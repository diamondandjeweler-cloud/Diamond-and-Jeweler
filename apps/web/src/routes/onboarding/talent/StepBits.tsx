/**
 * Small presentational building blocks for the Talent onboarding wizard.
 *
 * ProgressStep, FileRow and ReviewRow were relocated verbatim from
 * TalentOnboarding.tsx — markup, props and behavior are unchanged.
 */
import { useId, useState } from 'react'
import { Button } from '../../../components/ui'

// ── ProgressStep ─────────────────────────────────────────────────────────────

export function ProgressStep({ label, done, active, doneLabel, nextLabel }: { label: string; done?: boolean; active?: boolean; doneLabel: string; nextLabel: string }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
      active ? 'bg-brand-50 border-brand-200' : 'border-transparent'
    }`}>
      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
        done ? 'bg-emerald-500' : active ? 'bg-brand-500' : 'bg-ink-200 dark:bg-surface-2'
      }`}>
        {done ? (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div className={`h-2 w-2 rounded-full ${active ? 'bg-white' : 'bg-ink-400 dark:bg-fg-muted'}`} />
        )}
      </div>
      <span className={`text-sm flex-1 ${done ? 'text-emerald-700' : active ? 'text-brand-700 font-medium' : 'text-fg-muted'}`}>
        {label}
      </span>
      {done && <span className="text-xs text-emerald-600 font-medium">{doneLabel}</span>}
      {active && <span className="text-xs text-brand-600 font-medium">{nextLabel}</span>}
    </div>
  )
}

// ── FileRow ──────────────────────────────────────────────────────────────────

export function FileRow({
  label,
  accept,
  file,
  onChange,
  required,
  hint,
  maxBytes,
  chooseLabel,
  noFileLabel,
  tooLargeLabel,
}: {
  label: string
  accept: string
  file: File | null
  onChange: (f: File | null) => void
  required?: boolean
  hint?: string
  maxBytes?: number
  chooseLabel: string
  noFileLabel: string
  tooLargeLabel: (mb: number) => string
}) {
  const inputId = useId()
  const [sizeErr, setSizeErr] = useState<string | null>(null)
  return (
    <label htmlFor={inputId} className="block border border-dashed border-ink-300 dark:border-border rounded-lg p-3 hover:border-ink-400 dark:hover:border-border-strong transition cursor-pointer bg-surface">

      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-surface-2 flex items-center justify-center text-fg-muted shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z M14 3v6h6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-fg">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </div>
          <div className={`text-xs truncate ${sizeErr ? 'text-red-600' : 'text-fg-muted'}`}>
            {sizeErr ?? (file ? file.name : (hint ?? noFileLabel))}
          </div>
        </div>
        <Button asChild variant="secondary" size="sm" className="pointer-events-none shrink-0"><span>{chooseLabel}</span></Button>
      </div>
      <input
        id={inputId}
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          if (f && maxBytes && f.size > maxBytes) {
            setSizeErr(tooLargeLabel(Math.round(maxBytes / 1024 / 1024)))
            e.target.value = ''
            onChange(null)
            return
          }
          setSizeErr(null)
          onChange(f)
        }}
        className="sr-only"
      />
    </label>
  )
}

// ── ReviewRow ─────────────────────────────────────────────────────────────────

export function ReviewRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start gap-3 border border-border rounded-lg px-3 py-2 bg-surface">
      <span className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center shrink-0 text-xs ${ok ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
        {ok ? '✓' : '!'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ink-400 dark:text-fg-muted uppercase tracking-wide">{label}</p>
        <p className="text-sm text-fg break-words">{value}</p>
      </div>
    </div>
  )
}
