/**
 * Tabs variants — tailwind-variants translation of the ad-hoc tab patterns the
 * app already ships: the `.tabstrip` / `.tab` underline strip and the
 * `.pillnav` / `.pillnav-item` rail (both @layer components in src/index.css),
 * plus the hover underline hint from routes/dashboard/admin/TabButton.tsx.
 *
 * Neutral treatments use semantic tokens (border-border / text-fg-muted /
 * text-fg — src/ui/tokens.css) so they flip automatically under `.dark`,
 * replacing the old `.dark .tab*` / `.dark .pillnav*` hex overrides. Idle text
 * is fg-muted: light is byte-exact with the legacy ink-500; the dark value
 * (#a1a1aa) sits one scale step lighter than the legacy #71717a — inside the
 * library's 1-step harmonization budget, and better AA contrast on the dark
 * canvas. The two remaining `dark:` utilities are genuinely non-tokenizable
 * and justified inline below.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const tabsVariants = tv({
  slots: {
    // Both variants scroll horizontally on overflow, like the legacy
    // .tabstrip. (.tabstrip's mobile full-bleed `-mx-4 px-4 md:mx-0 md:px-0`
    // is page-layout specific — callers add it via className when needed.)
    list: 'overflow-x-auto',
    trigger: [
      'shrink-0 whitespace-nowrap',
      // Shared idle/hover ink: `.tab` and `.pillnav-item` both went
      // ink-500 → ink-900 on hover. Hover is scoped to the inactive state so
      // it can never fight the active treatment (the states are mutually
      // exclusive, so CSS order is irrelevant).
      'text-fg-muted data-[state=inactive]:hover:text-fg',
      // House disabled treatment (matches Button). Radix also skips disabled
      // triggers during arrow-key navigation.
      'disabled:opacity-50 disabled:pointer-events-none',
      // No outline utilities here — keyboard focus comes from the global
      // :focus-visible outline (index.css @layer base), neither duplicated
      // nor suppressed.
    ],
    // Panels are content-shaped: spacing/typography belong to the caller.
    panel: '',
  },
  variants: {
    variant: {
      underline: {
        // `.tabstrip`: the strip hairline adopts the border token
        // (ink-200/70 light; flips itself in dark).
        list: 'flex gap-1 border-b border-border',
        trigger: [
          // `.tab` box + type
          'px-3 py-2 text-sm font-medium border-b-2 -mb-px border-transparent transition-colors',
          // TabButton.tsx's hover underline hint, tokenized — border-strong's
          // dark value is the exact #52525b its dark:hover:border-gray-600
          // used. Inactive-scoped for the same no-fight reason as above.
          'data-[state=inactive]:hover:border-border-strong',
          // `.tab.active`: brand-700 text on a brand-600 underline (AA: 700+
          // for accent-coloured text on light).
          'data-[state=active]:text-brand-700 data-[state=active]:border-brand-600',
          // dark: justified — the semantic tokens are neutrals-only, so there
          // is no "brand-on-dark" token to reach for, and brand-700 is ~1.6:1
          // against the dark canvas (fails AA). brand-400 is the closest
          // brand-scale step to the legacy `.dark .tab.active` #818cf8
          // (indigo-400) — the same 1-step harmonization budget Button's
          // ghost used — and reads ~6:1 on the dark canvas.
          'dark:data-[state=active]:text-brand-400 dark:data-[state=active]:border-brand-400',
        ],
      },
      pill: {
        // `.pillnav`: rounded-full rail on a surface; the border token's
        // alpha hairline stands in for the legacy ink-200/80. max-w-full so
        // the inline-flex rail can actually overflow-scroll in flex parents.
        list: 'inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-soft',
        trigger: [
          // `.pillnav-item`
          'rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-150',
          // `.pillnav-item.active`: inverse fill in light (ink-900 / white).
          'data-[state=active]:bg-ink-900 data-[state=active]:text-white data-[state=active]:shadow-soft',
          // dark: justified — light mode is an *inverse* fill while dark mode
          // is a *raised neutral*, a structural flip no single token pair can
          // express. The override itself IS token-mapped: the legacy
          // `.dark .pillnav-item.active` #3f3f46 / #e4e4e7 are exactly the
          // dark values of surface-2 / fg.
          'dark:data-[state=active]:bg-surface-2 dark:data-[state=active]:text-fg',
        ],
      },
    },
  },
  defaultVariants: { variant: 'underline' },
})

export type TabsVariantProps = VariantProps<typeof tabsVariants>
