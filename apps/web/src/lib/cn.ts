import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind class lists. `clsx` resolves conditional / array / object
 * inputs; `tailwind-merge` de-dupes conflicting utilities so a caller's
 * `className` actually wins over a component's defaults — e.g.
 * `cn('px-4 text-sm', 'px-8')` → `'text-sm px-8'`.
 *
 * Use in every primitive: `className={cn(base, variants({ … }), className)}`
 * with the caller's `className` LAST.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
