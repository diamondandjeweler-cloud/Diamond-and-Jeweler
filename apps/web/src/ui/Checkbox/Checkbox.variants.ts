/**
 * Checkbox variants — tailwind-variants recipe for the Radix-based checkbox.
 *
 * Box colors: the unchecked box uses semantic tokens (bg-surface +
 * border-border-strong — see src/ui/tokens.css), so the neutral off-state
 * flips automatically under `.dark` with zero `dark:` utilities. The checked /
 * indeterminate box keeps a fixed brand-600 fill in both themes, mirroring the
 * Switch track and Button's tonal fills (primary/brand/danger), which also
 * render identically in light and dark.
 *
 * The glyph (check / indeterminate dash) stays white in both themes: white on
 * brand-600 is ≈6.4:1 — clear of WCAG AA even for text — the same way Button
 * keeps `text-white` on its tonal fills and Switch keeps its white thumb.
 *
 * Focus: no outline/ring utilities here — the global `:focus-visible` outline
 * in index.css @layer base provides the visible keyboard-focus ring (it is
 * neither suppressed nor duplicated).
 *
 * Label/description recipes live here too (Badge precedent: one variants file
 * may hold several tv() recipes). Their `disabled` boolean variant dims the
 * text to match the box's own disabled:opacity-50, since the text nodes sit
 * outside the disabled control and can't inherit its state.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const checkboxVariants = tv({
  base: [
    // Root renders a native <button role="checkbox"> via Radix.
    'inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded',
    'border border-border-strong bg-surface',
    'transition-colors duration-150',
    // Radix exposes checked/indeterminate via data-state; both are "on" fills.
    'data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600',
    'data-[state=indeterminate]:border-brand-600 data-[state=indeterminate]:bg-brand-600',
    'disabled:opacity-50 disabled:pointer-events-none',
  ],
})

/** Wrapper Radix mounts only while checked/indeterminate — centers the glyph
 *  and carries the white `currentColor` the SVGs stroke with. */
export const checkboxIndicatorVariants = tv({
  base: 'flex items-center justify-center text-white',
})

export const checkboxLabelVariants = tv({
  base: 'select-none text-sm font-medium text-fg',
  variants: {
    disabled: {
      // Clicking the label toggles the control, so the cursor advertises it —
      // and stops advertising it when the control is disabled.
      true: 'cursor-not-allowed opacity-50',
      false: 'cursor-pointer',
    },
  },
  defaultVariants: { disabled: false },
})

export const checkboxDescriptionVariants = tv({
  base: 'text-sm text-fg-muted',
  variants: {
    disabled: {
      true: 'opacity-50',
      false: '',
    },
  },
  defaultVariants: { disabled: false },
})

export type CheckboxVariantProps = VariantProps<typeof checkboxVariants>
export type CheckboxIndicatorVariantProps = VariantProps<typeof checkboxIndicatorVariants>
export type CheckboxLabelVariantProps = VariantProps<typeof checkboxLabelVariants>
export type CheckboxDescriptionVariantProps = VariantProps<typeof checkboxDescriptionVariants>
