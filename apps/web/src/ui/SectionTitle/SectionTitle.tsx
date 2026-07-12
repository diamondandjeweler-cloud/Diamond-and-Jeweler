/**
 * SectionTitle — in-page section heading: eyebrow + title + right-aligned
 * action.
 *
 * Moved verbatim from components/ui.tsx (same props and className strings; DOM
 * output byte-identical). components/ui re-exports this via a thin deprecated
 * shim.
 */
import type { ReactNode } from 'react'

export function SectionTitle({
  title, eyebrow, action,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="font-display text-xl text-fg">{title}</h2>
      </div>
      {action}
    </div>
  )
}
