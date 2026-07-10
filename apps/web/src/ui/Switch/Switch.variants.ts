/**
 * Switch variants — tailwind-variants recipe for the Radix-based toggle.
 *
 * Track colors: the unchecked track uses the `border-strong` semantic token
 * (ink-300 in light — see src/ui/tokens.css), so the neutral off-state flips
 * automatically under `.dark` with zero `dark:` utilities. The checked track
 * keeps a fixed brand-600 fill in both themes, mirroring how Button's tonal
 * fills (primary/brand/danger) render identically in light and dark.
 *
 * The thumb stays `bg-white` in both themes: white clears WCAG non-text
 * contrast against BOTH track fills (brand-600 and the token's light/dark
 * neutral values), the same way Button keeps `text-white` on its tonal fills.
 *
 * Focus: no outline/ring utilities here — the global `:focus-visible` outline
 * in index.css @layer base provides the visible keyboard-focus ring (it is
 * neither suppressed nor duplicated).
 *
 * Size: md only for now; modeled as a `size` variant so future sizes are an
 * additive change to this file rather than an API break. The checked-thumb
 * travel is geometry, so it lives with each size (track w-9 − thumb w-4 −
 * 2×2px transparent border = 16px = translate-x-4).
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const switchVariants = tv({
  base: [
    // Root renders a native <button role="switch"> via Radix.
    'inline-flex shrink-0 cursor-pointer items-center rounded-full',
    // Transparent border doubles as the thumb inset, so the track's box is
    // honest (h-5 w-9) and the thumb never kisses the edge.
    'border-2 border-transparent',
    'transition-colors duration-150',
    'data-[state=unchecked]:bg-border-strong data-[state=checked]:bg-brand-600',
    'disabled:opacity-50 disabled:pointer-events-none',
  ],
  variants: {
    size: {
      md: 'h-5 w-9',
    },
  },
  defaultVariants: { size: 'md' },
})

export const switchThumbVariants = tv({
  base: [
    'pointer-events-none block rounded-full bg-white shadow-soft',
    'transition-transform duration-150',
  ],
  variants: {
    size: {
      md: 'h-4 w-4 data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-4',
    },
  },
  defaultVariants: { size: 'md' },
})

export type SwitchVariantProps = VariantProps<typeof switchVariants>
export type SwitchThumbVariantProps = VariantProps<typeof switchThumbVariants>
