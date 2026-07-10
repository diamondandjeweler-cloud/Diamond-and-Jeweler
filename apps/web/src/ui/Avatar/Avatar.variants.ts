/**
 * Avatar variants — sizing recipe for the circular root plus the deterministic
 * fallback-tint recipe used behind the photo / initials.
 *
 * The hairline uses the semantic border token (ring-border → var(--border),
 * src/ui/tokens.css) so it flips automatically under `.dark` — no `dark:`
 * utilities anywhere in this recipe. The six tints follow the Badge tonal
 * convention: tokenized light fills paired with their AA-safe 700-grade text
 * (accent text must be 700+ on light — see the accent scale comment in
 * tailwind.config.js), rendered identically in both themes. That is deliberate:
 * the tint is an *identity* color derived from the person's name, so it stays
 * stable across theme switches, and dark-on-light keeps AA contrast in dark
 * mode too.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const avatarVariants = tv({
  base: [
    'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden',
    'rounded-full align-middle font-medium ring-1 ring-border',
  ],
  variants: {
    size: {
      xs: 'h-6 w-6 text-[10px]',
      sm: 'h-8 w-8 text-xs',
      md: 'h-10 w-10 text-sm',
      lg: 'h-12 w-12 text-base',
    },
  },
  defaultVariants: { size: 'md' },
})

/**
 * Fallback tint — picked deterministically from the name hash (see getTint in
 * Avatar.tsx). Kept as its own recipe so the tint classes can also be reused
 * for name-seeded chips elsewhere without dragging in the sizing recipe.
 */
export const avatarTintVariants = tv({
  variants: {
    tint: {
      brand:  'bg-brand-100 text-brand-700',
      green:  'bg-emerald-100 text-emerald-700',
      amber:  'bg-amber-100 text-amber-700',
      red:    'bg-red-100 text-red-700',
      accent: 'bg-accent-100 text-accent-800',
      gray:   'bg-ink-100 text-ink-700',
    },
  },
  defaultVariants: { tint: 'gray' },
})

export type AvatarVariantProps = VariantProps<typeof avatarVariants>
export type AvatarTintVariantProps = VariantProps<typeof avatarTintVariants>
