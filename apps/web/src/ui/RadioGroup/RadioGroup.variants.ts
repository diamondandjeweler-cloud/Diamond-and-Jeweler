/**
 * RadioGroup variants — tv() recipes for the Radix-based single-choice field
 * (RadioGroup.tsx).
 *
 * Neutrals come from the semantic tokens (bg-surface / text-fg / text-fg-muted
 * — see src/ui/tokens.css) so one definition renders correctly in both themes.
 * Two deliberate deviations, both contrast-driven:
 *
 * - The control's resting border uses `fg-subtle` rather than the hairline
 *   tokens: `border` / `border-strong` sit at ~1.9:1 against their surface —
 *   fine for card edges, below the 3:1 WCAG 1.4.11 minimum for a form-control
 *   boundary. `fg-subtle` is the lightest neutral token that clears 3:1 in
 *   BOTH themes (ink-400 on white ≈ 3.4:1, #71717a on the dark surface ≈ 3:1),
 *   and it still theme-flips for free.
 *
 * - NOTE on `dark:` (checked state only): the brand ramp is a fixed scale with
 *   no theme-flipping token, and brand-600 against the dark surface is only
 *   ~2:1 — below the 3:1 non-text minimum — so dark mode steps the checked
 *   border + dot up to brand-400 (≈ 4.9:1). Genuinely non-tokenizable; parity
 *   beats purity.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const radioGroupVariants = tv({
  slots: {
    /** Radix Root — vertical stack; callers relayout via className. */
    root: 'grid gap-2.5',
    /** Optional group label, referenced by the root via aria-labelledby. */
    label: 'text-sm font-medium text-fg',
  },
})

export const radioGroupItemVariants = tv({
  slots: {
    // Control / label / description are grid SIBLINGS (never nested) so the
    // text cells can react to the control button's :disabled via `peer-*` —
    // this covers both item-level and group-level disabling, since Radix puts
    // the `disabled` attribute on each item button in either case.
    root: 'grid grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-1',
    control: [
      // 18px circle, optically centered against the label's 20px first line.
      'peer col-start-1 row-start-1 mt-px h-[1.125rem] w-[1.125rem] shrink-0 rounded-full',
      'border border-fg-subtle bg-surface transition-colors duration-150',
      'hover:border-fg-muted',
      'data-[state=checked]:border-brand-600 dark:data-[state=checked]:border-brand-400',
      'disabled:cursor-not-allowed disabled:opacity-50',
      // Keyboard-focus ring layered on top of the global :focus-visible outline
      // (index.css @layer base) — same recipe as Button; nothing suppressed.
      'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500',
    ],
    /** Radix Indicator — only mounts while checked; centers the dot. */
    indicator: 'flex h-full w-full items-center justify-center',
    /** The checked dot. Dark shade rationale in the header NOTE. */
    dot: 'h-2 w-2 rounded-full bg-brand-600 dark:bg-brand-400',
    label: [
      'col-start-2 row-start-1 cursor-pointer text-sm font-medium text-fg',
      'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
    ],
    description: 'col-start-2 row-start-2 text-sm text-fg-muted peer-disabled:opacity-50',
  },
})

export type RadioGroupVariantProps = VariantProps<typeof radioGroupVariants>
export type RadioGroupItemVariantProps = VariantProps<typeof radioGroupItemVariants>
