/**
 * Button variants — tailwind-variants translation of the `.btn` / `.btn-*`
 * @layer components rules in src/index.css.
 *
 * Neutral treatments (secondary / ghost) use semantic tokens (bg-surface /
 * border-border / text-fg — see src/ui/tokens.css) so they flip automatically
 * under `.dark`, replacing the old `.dark .btn-secondary` / `.dark .btn-ghost`
 * hex overrides (the dark token values are the exact hex those overrides used).
 * primary keeps its fixed ink-900 fill and danger/success/brand keep their
 * tonal classes — none of them had a `.dark` override, so they render
 * identically in both themes, as before.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const buttonVariants = tv({
  base: [
    // `.btn` shared base
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium text-sm',
    'transition-all duration-150 active:scale-[0.98]',
    'disabled:opacity-50 disabled:pointer-events-none',
    // Keyboard-focus ring layered on top of the global :focus-visible outline
    // (index.css @layer base) — exactly what `.btn` did. No outline utilities
    // here, so the global rule is neither duplicated nor suppressed.
    'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500',
  ],
  variants: {
    variant: {
      primary: 'bg-ink-900 text-white shadow-soft hover:bg-ink-800 active:bg-ink-900',
      brand: [
        'text-white shadow-soft',
        // `.btn-brand`'s linear-gradient(180deg, brand-600, brand-700) + the
        // lifted hover state. The hover glow was rgba(62,79,211,.45), which is
        // brand-600 @ 45% — expressed via theme() to keep this file hex-free.
        'bg-gradient-to-b from-brand-600 to-brand-700',
        'hover:from-brand-500 hover:to-brand-600',
        'hover:shadow-[0_6px_20px_-8px_theme(colors.brand.600/45%)]',
      ],
      secondary: 'bg-surface text-fg border border-border hover:bg-surface-2 hover:border-border-strong',
      // ghost keeps the legacy ink-700 in light (fg-muted is 2 scale-steps
      // lighter — past the library's 1-step harmonization budget); dark uses
      // the fg-muted token, whose dark value is the exact legacy #a1a1aa.
      ghost: 'text-ink-700 dark:text-fg-muted hover:bg-surface-2',
      danger: 'bg-red-600 text-white shadow-soft hover:bg-red-700',
      success: 'bg-emerald-600 text-white shadow-soft hover:bg-emerald-700',
    },
    size: {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2.5',
      lg: 'px-5 py-3 text-base',
    },
  },
  compoundVariants: [
    // `.btn-ghost` carried its own tighter default box (px-3 py-2) while
    // `.btn-sm` / `.btn-lg` overrode it — so only md keeps the ghost padding.
    { variant: 'ghost', size: 'md', class: 'px-3 py-2' },
  ],
  defaultVariants: { variant: 'primary', size: 'md' },
})

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
