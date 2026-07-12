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

/**
 * `segmented` item recipe — a pill / segmented-control option with NO radio
 * circle: the whole pill IS the click target, brand-filled when selected.
 *
 * This bakes in the look of the hand-rolled single-select `<button>` pills it
 * replaces (talent onboarding DOB step: gender / race / commute), so adopting
 * it is a visual no-op — parity beats purity:
 *
 *   base pill      → `border rounded-lg px-3 py-2 text-sm`
 *   resting (unchecked) → `border-border text-ink-700 dark:text-fg-strong`, and
 *     hover applies ONLY while unchecked (mirrors the original, whose hover
 *     class lived solely in the unselected ternary branch — keyed here on Radix's
 *     `data-state="unchecked"` so a checked pill never greys on hover).
 *   selected (checked)  → solid `bg-brand-500` fill in BOTH themes (the original
 *     had no dark step-up; white-on-brand-500 still clears AA in dark).
 *
 * Unlike the default variant's 1px-border control, contrast here is text-on-fill
 * (white on brand-500), not border-on-surface, so the default variant's dark
 * `brand-400` border step-up is unnecessary.
 *
 * The `size` dimension keeps two shapes first-class: `md` pills (onboarding) and
 * square `tile`s (e.g. a 1–5 rating scale). Bespoke per-call-site colours (an
 * older non-tokenised card can differ, e.g. brand-600 fill on a `bg-white`
 * surface) are reached with a caller `className`, which `cn()` merges last.
 */
export const radioGroupSegmentedItemVariants = tv({
  base: [
    'inline-flex select-none items-center justify-center border text-center transition-colors',
    'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
    // Resting (unchecked): tokenised + theme-aware; hover only while unchecked.
    'data-[state=unchecked]:border-border data-[state=unchecked]:text-ink-700 dark:data-[state=unchecked]:text-fg-strong',
    'data-[state=unchecked]:hover:bg-ink-50 dark:data-[state=unchecked]:hover:bg-surface',
    // Selected: solid brand fill (same shade in both themes — parity).
    'data-[state=checked]:border-brand-500 data-[state=checked]:bg-brand-500 data-[state=checked]:text-white',
    // Keyboard focus ring — same recipe as Button and the default control.
    'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500',
  ],
  variants: {
    size: {
      md: 'rounded-lg px-3 py-2 text-sm',
      tile: 'h-12 w-12 rounded text-lg',
    },
  },
  defaultVariants: { size: 'md' },
})

export type RadioGroupVariantProps = VariantProps<typeof radioGroupVariants>
export type RadioGroupItemVariantProps = VariantProps<typeof radioGroupItemVariants>
export type RadioGroupSegmentedItemVariantProps = VariantProps<typeof radioGroupSegmentedItemVariants>
/** Segmented pill shape presets. */
export type RadioGroupSegmentedSize = NonNullable<RadioGroupSegmentedItemVariantProps['size']>
