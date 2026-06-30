/**
 * Small presentational building blocks for the HM onboarding wizard.
 *
 * HMReviewRow was relocated verbatim from HMOnboarding.tsx — markup, props and
 * behavior are unchanged.
 */

// ── HMReviewRow ───────────────────────────────────────────────────────────────

export function HMReviewRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start gap-3 border border-ink-100 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
      <span className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center shrink-0 text-xs ${ok ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
        {ok ? '✓' : '!'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ink-400 dark:text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-ink-800 dark:text-gray-300 break-words">{value}</p>
      </div>
    </div>
  )
}
