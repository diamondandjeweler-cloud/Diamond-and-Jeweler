/**
 * Badge — small tonal label / status pill, with an optional leading status dot.
 *
 * Drop-in replacement for the Badge in components/ui.tsx: same exported names
 * (Badge, BadgeTone), same props (children, tone, className, dot) and the same
 * 'gray' default. Styling moved from the `.badge-*` @layer classes in index.css
 * into Badge.variants.ts (tailwind-variants + semantic tokens).
 */
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { badgeVariants, badgeDotVariants, type BadgeVariantProps } from './Badge.variants'

/** Derived from the variant map so the public type can't drift from the styles. */
export type BadgeTone = NonNullable<BadgeVariantProps['tone']>

export interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  className?: string
  /** Render a leading status dot in the tone's saturated color. */
  dot?: boolean
}

export function Badge({ children, tone = 'gray', className, dot }: BadgeProps) {
  return (
    // Caller className last so it wins via twMerge.
    <span className={cn(badgeVariants({ tone }), className)}>
      {dot && <span className={badgeDotVariants({ tone })} />}
      {children}
    </span>
  )
}
