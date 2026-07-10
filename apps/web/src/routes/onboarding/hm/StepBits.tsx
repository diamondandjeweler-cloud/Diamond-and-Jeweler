/**
 * Small presentational building blocks for the HM onboarding wizard.
 *
 * HMReviewRow was relocated verbatim from HMOnboarding.tsx — markup, props and
 * behavior are unchanged.
 */

// ── HMReviewRow ───────────────────────────────────────────────────────────────

export function HMReviewRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
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
