/**
 * Badge variants — tailwind-variants translation of the `.badge` / `.badge-*`
 * @layer components rules in src/index.css.
 *
 * The neutral (gray) tone keeps byte-parity with the legacy pair: no token pair
 * reproduces ink-100/#27272a, so it uses scale colors + an explicit dark:
 * override (dark:bg-surface = the exact #27272a the old `.dark .badge-gray`
 * used). The ring deliberately stays ink-200/70 in BOTH themes — in dark the
 * light ring was the only thing delineating the badge against an equally-dark
 * card, a legacy quirk we preserve. The tonal tones (brand/green/amber/red/
 * accent) had no dark override, so they keep their exact light-mode classes in
 * both themes — same rendering as before.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const badgeVariants = tv({
  // `.badge` base + the ring treatment every tone shared
  base: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset',
  variants: {
    tone: {
      gray:   'bg-ink-100 text-ink-700 ring-ink-200/70 dark:bg-surface dark:text-fg-muted',
      brand:  'bg-brand-50 text-brand-700 ring-brand-200/70',
      green:  'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
      amber:  'bg-amber-50 text-amber-700 ring-amber-200/70',
      red:    'bg-red-50 text-red-700 ring-red-200/70',
      accent: 'bg-accent-500/10 text-accent-700 ring-accent-500/20',
    },
  },
  defaultVariants: { tone: 'gray' },
})

/**
 * Leading status dot — colors preserved exactly from the old inline map in
 * components/ui.tsx (the gray dot stays ink-400 in both themes, as before).
 */
export const badgeDotVariants = tv({
  base: 'h-1.5 w-1.5 rounded-full',
  variants: {
    tone: {
      gray:   'bg-ink-400',
      brand:  'bg-brand-500',
      green:  'bg-emerald-500',
      amber:  'bg-amber-500',
      red:    'bg-red-500',
      accent: 'bg-accent-500',
    },
  },
  defaultVariants: { tone: 'gray' },
})

export type BadgeVariantProps = VariantProps<typeof badgeVariants>
export type BadgeDotVariantProps = VariantProps<typeof badgeDotVariants>
