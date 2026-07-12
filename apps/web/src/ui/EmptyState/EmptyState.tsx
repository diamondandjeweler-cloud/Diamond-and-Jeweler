/**
 * EmptyState — centred icon + title + description + optional action.
 *
 * Moved verbatim from components/ui.tsx (same props, defaults and className
 * strings; DOM output byte-identical). components/ui re-exports this via a thin
 * deprecated shim.
 */
import type { ReactNode } from 'react'

export function EmptyState({
  title, description, action, icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="text-center py-14 px-6">
      <div className="mx-auto mb-4 h-12 w-12 flex items-center justify-center rounded-full bg-surface-2 text-ink-400 dark:text-fg-muted">
        {icon ?? <DefaultEmptyIcon />}
      </div>
      <h3 className="font-display text-lg text-fg mb-1">{title}</h3>
      {description && <p className="text-sm text-fg-muted mb-4 max-w-sm mx-auto">{description}</p>}
      {action}
    </div>
  )
}

function DefaultEmptyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 11h6M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}
