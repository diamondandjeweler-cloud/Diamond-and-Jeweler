/**
 * Stat — KPI tile: eyebrow label, display-size value, optional hint and icon.
 *
 * Drop-in replacement for the Stat in components/ui.tsx: same export name,
 * props and defaults. Styling moves from the `.stat*` @layer classes to
 * tv() slots (Stat.variants.ts) on semantic tokens, so light/dark both come
 * from one source. Purely presentational — not interactive, no focus or aria
 * semantics (matching the original).
 */
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { statVariants, type StatTone } from './Stat.variants'

export interface StatProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: StatTone
  icon?: ReactNode
  /** Extra classes for the tile root — merged last, so the caller wins. */
  className?: string
}

export function Stat({ label, value, hint, tone = 'default', icon, className }: StatProps) {
  const slots = statVariants({ tone })
  return (
    <div className={cn(slots.root(), className)}>
      <div className={slots.header()}>
        <div className={slots.label()}>{label}</div>
        {icon && <div className={slots.icon()}>{icon}</div>}
      </div>
      <div className={slots.value()}>{value}</div>
      {hint && <div className={slots.hint()}>{hint}</div>}
    </div>
  )
}
Stat.displayName = 'Stat'
