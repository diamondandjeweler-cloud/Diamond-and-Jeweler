/**
 * PageHeader — page-level title block: eyebrow + display title + description +
 * right-aligned actions.
 *
 * Moved verbatim from components/ui.tsx (same props and className strings; DOM
 * output byte-identical). components/ui re-exports this via a thin deprecated
 * shim.
 */
import type { ReactNode } from 'react'

export function PageHeader({
  title, description, actions, eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-display-sm text-fg mb-1.5 leading-tight">{title}</h1>
        {description && <p className="text-fg-muted text-sm md:text-[15px] max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
