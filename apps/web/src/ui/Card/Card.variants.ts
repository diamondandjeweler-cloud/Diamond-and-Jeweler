/**
 * Card — tailwind-variants definitions.
 *
 * Translates the legacy `@layer components` classes in index.css
 * (.card / .card-p / .card-hover / .card-elevated + their `.dark` overrides)
 * into tv() variants built on the semantic tokens (bg-surface / border-border /
 * text-fg — see src/ui/tokens.css), which flip automatically under `.dark`.
 * This replaces the hand-appended `dark:bg-gray-800 dark:border-gray-700` the
 * old JSX carried (which the `.dark .card` override out-cascaded anyway — the
 * rendered dark values were always the token values #27272a / rgba(63,63,70,.7)).
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const cardVariants = tv({
  base: 'bg-surface border border-border rounded-xl2',
  variants: {
    elevated: {
      // .card — flat resting shadow.
      false: 'shadow-soft',
      // .card-elevated — inset top highlight + two-layer drop shadow. There is
      // no shadow token that flips per theme (shadow-soft/card/float are
      // light-tuned statics), so the dark treatment keeps an explicit dark:
      // arbitrary shadow mirroring the legacy `.dark .card-elevated` override
      // byte-for-byte (dimmed inset highlight, deeper black ambient).
      true: 'shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_1px_2px_rgba(20,21,17,0.04),0_8px_24px_-10px_rgba(20,21,17,0.10)] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_2px_rgba(0,0,0,0.3),0_8px_24px_-10px_rgba(0,0,0,0.4)]',
    },
    hoverable: {
      // .card-hover
      true: 'hover:shadow-card hover:border-border-strong transition-all duration-200',
    },
  },
  defaultVariants: {
    elevated: false,
  },
})

export type CardVariants = VariantProps<typeof cardVariants>

/** Padded content region — the legacy CardBody's literal `p-6` (≡ .card-p). */
export const cardBodyVariants = tv({ base: 'p-6' })

export type CardBodyVariants = VariantProps<typeof cardBodyVariants>

/**
 * Header row: eyebrow + title + optional subtitle on the left, action slot on
 * the right. `.eyebrow` itself remains an index.css class (shared beyond Card).
 */
export const cardHeaderVariants = tv({
  slots: {
    root: 'flex items-start justify-between gap-4 px-6 pt-6 pb-3',
    body: 'min-w-0',
    eyebrow: 'eyebrow mb-1',
    title: 'font-display text-xl text-fg truncate',
    subtitle: 'mt-1 text-sm text-fg-muted',
    right: 'shrink-0',
  },
})

export type CardHeaderVariants = VariantProps<typeof cardHeaderVariants>
