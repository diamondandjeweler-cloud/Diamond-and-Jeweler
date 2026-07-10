/**
 * Pagination variants — token-driven recipe for the page-navigation primitive
 * (nav shell, page/stepper buttons, truncation ellipsis).
 *
 * Idle items are ghost-style via semantic tokens (text-fg-muted +
 * hover:bg-surface-2 — see src/ui/tokens.css) so both themes resolve from one
 * place with no `dark:` utilities. The current-page pill is the single
 * deliberate exception, justified inline below.
 */
import { tv, type VariantProps } from 'tailwind-variants'

/** The <nav> shell — layout only; all theming lives on the items. */
export const paginationVariants = tv({
  base: 'flex flex-wrap items-center gap-1',
})

/** Page-number buttons and the Prev/Next steppers. */
export const paginationItemVariants = tv({
  base: [
    'inline-flex h-9 min-w-9 select-none items-center justify-center px-2',
    'rounded-lg text-sm font-medium tabular-nums',
    'transition-colors duration-150',
    'disabled:opacity-50 disabled:pointer-events-none',
    // Keyboard focus comes from the global :focus-visible outline in
    // index.css @layer base — no outline/ring utilities here, so that rule
    // is neither suppressed nor duplicated.
  ],
  variants: {
    state: {
      // Ghost treatment — pure tokens, flips automatically under `.dark`.
      default: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      // Current page — solid inverse pill matching Button primary's
      // ink-900/white fill in light. Genuinely non-tokenizable there: no
      // semantic token is pure white, and `fg` names a text color, not a
      // fill. Left un-flipped, the ink-900 fill would vanish against dark
      // surfaces, so dark inverts through the tokens themselves (`bg-fg` →
      // #e4e4e7 pill, `text-canvas` → near-black text, ≈13:1) — the one
      // justified `dark:` pair in this recipe.
      current: 'bg-ink-900 text-white shadow-soft dark:bg-fg dark:text-canvas',
    },
  },
  defaultVariants: { state: 'default' },
})

/** Collapsed-range marker — decorative (rendered aria-hidden), non-interactive. */
export const paginationEllipsisVariants = tv({
  base: 'inline-flex h-9 min-w-9 select-none items-center justify-center text-fg-muted',
})

export type PaginationVariantProps = VariantProps<typeof paginationVariants>
export type PaginationItemVariantProps = VariantProps<typeof paginationItemVariants>
export type PaginationEllipsisVariantProps = VariantProps<typeof paginationEllipsisVariants>
