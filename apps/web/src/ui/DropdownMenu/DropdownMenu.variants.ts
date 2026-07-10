/**
 * DropdownMenu variants — tv() recipes for the floating panel and its parts.
 *
 * Everything themes through the semantic tokens (bg-surface / border-border /
 * text-fg — see src/ui/tokens.css), so the panel flips under `.dark` with zero
 * `dark:` utilities. The ONE exception is the danger item's red treatment:
 * reds have no semantic token, and the light pair (red-600 on red-50) fails
 * contrast on the dark surface — so it carries a justified `dark:` override
 * (see the `danger` variant below).
 */
import { tv, type VariantProps } from 'tailwind-variants'

/**
 * Floating panel (Radix Content). Portalled, so z-50 keeps it above sticky
 * headers and elevated cards. Radix unmounts on close, so only an entry
 * animation is needed (fade-in from tailwind.config.js keyframes).
 */
export const dropdownMenuContentVariants = tv({
  base: [
    'z-50 min-w-44 rounded-xl border border-border bg-surface p-1 text-fg shadow-float',
    'data-[state=open]:animate-fade-in',
  ],
})

/**
 * Menu item. Pointer hover and keyboard navigation share Radix's
 * data-[highlighted] state, so both input modes get the same treatment. The
 * global `:focus-visible` outline (index.css @layer base) still fires on
 * keyboard focus — no outline utilities here, so that rule is neither
 * duplicated nor suppressed.
 */
export const dropdownMenuItemVariants = tv({
  base: [
    'flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-fg',
    'data-[highlighted]:bg-surface-2',
    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  ],
  variants: {
    danger: {
      true: [
        // Destructive tint on the red scale (no semantic token exists for
        // reds). Highlighted text deepens to red-700: red-600 on red-50 is
        // only ~4.4:1 (just under AA), red-700 clears ~5.9:1.
        'text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700',
        // dark: justified (non-tokenizable treatment): red-600 on the dark
        // surface is ~3:1 (fails AA) and a red-50 highlight would paint a
        // light slab inside a dark panel — so dark flips to red-400 text on a
        // low-alpha red-950 tint (red-300 when highlighted, mirroring the
        // light theme's 600→700 step; both clear AA on the mixed background).
        'dark:text-red-400 dark:data-[highlighted]:bg-red-950/40 dark:data-[highlighted]:text-red-300',
      ],
      false: '',
    },
  },
  defaultVariants: { danger: false },
})

/**
 * Leading icon slot — decorative (DropdownMenu.Item renders it aria-hidden).
 * Neutral items mute the glyph one step (fg-subtle); danger items inherit the
 * red via currentColor so glyph and label always match state.
 */
export const dropdownMenuItemIconVariants = tv({
  base: 'shrink-0 [&>svg]:block',
  variants: {
    danger: {
      true: 'text-current',
      false: 'text-fg-subtle',
    },
  },
  defaultVariants: { danger: false },
})

/** Non-interactive section heading inside the panel. */
export const dropdownMenuLabelVariants = tv({
  base: 'px-2.5 py-1.5 text-xs font-medium text-fg-muted',
})

/** Hairline divider — negative margin bleeds it across the panel's p-1 inset. */
export const dropdownMenuSeparatorVariants = tv({
  base: '-mx-1 my-1 h-px bg-border',
})

export type DropdownMenuItemVariantProps = VariantProps<typeof dropdownMenuItemVariants>
export type DropdownMenuItemIconVariantProps = VariantProps<typeof dropdownMenuItemIconVariants>
