/**
 * Tooltip variants — the floating content panel + its arrow.
 *
 * Light mode is an INVERTED surface: an ink-900 panel with white text
 * (≈18:1 — AA), so the tip reads above any light card it floats over.
 * Dark mode is NOT the same shape flipped — an inverted panel there would be
 * a glaring near-white — it is instead an ELEVATED surface: surface-2 + fg
 * text (≈8.2:1 — AA) with a hairline border doing the delineating that the
 * shadow does in light. The semantic tokens can only flip a value WITH the
 * theme; they cannot express this cross-theme shape change (inverted panel →
 * elevated panel), so this file carries explicit `dark:` utilities — the
 * sanctioned exception for a genuinely non-tokenizable treatment.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const tooltipVariants = tv({
  base: [
    // Panel box. max-w keeps long hints wrapping instead of spanning the
    // viewport; select-none because the content is ephemeral hint text.
    'z-50 max-w-xs select-none rounded-lg px-2.5 py-1.5 text-xs leading-snug',
    'animate-fade-in',
    // Light: inverted ink-900 panel, white on ink-900 ≈18:1 (AA).
    'bg-ink-900 text-white shadow-float',
    // Dark: elevated surface + hairline border; fg on surface-2 ≈8.2:1 (AA).
    // `dark:` justified — see the file doc comment (inverted→elevated is not
    // expressible with flip-in-place tokens).
    'dark:border dark:border-border dark:bg-surface-2 dark:text-fg',
  ],
})

export const tooltipArrowVariants = tv({
  // The arrow matches the panel fill in each theme (same `dark:` rationale as
  // above). Radix arrows are a plain filled polygon, so the dark hairline
  // border is not drawn on the arrow itself — at 10×5px the seam is
  // imperceptible and the panel border still delineates the tip.
  base: 'fill-ink-900 dark:fill-surface-2',
})

export type TooltipVariantProps = VariantProps<typeof tooltipVariants>
export type TooltipArrowVariantProps = VariantProps<typeof tooltipArrowVariants>
