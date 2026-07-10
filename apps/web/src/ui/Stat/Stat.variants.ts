/**
 * Stat variants — tv() port of the legacy `.stat` / `.stat-label` /
 * `.stat-value` / `.stat-hint` @layer components (src/index.css) and their
 * `.dark` overrides.
 *
 * Parity notes (verified against index.css + src/ui/tokens.css):
 * - Shell: `.stat` = `.card-elevated p-5 relative overflow-hidden`. Neutral
 *   surface/border move to tokens (bg-surface / border-border), which already
 *   encode the rendered dark values (`.dark .stat` #27272a, border
 *   rgba(63,63,70,.7)) — the old inline `dark:bg-gray-800` was overridden by
 *   `.dark .stat` anyway. The elevated box-shadow recipe has no token, so it
 *   stays as arbitrary values with a `dark:` twin — byte-copies of
 *   `.card-elevated` / `.dark .card-elevated`.
 * - Sheen: `.stat::before` (white→transparent gradient, inset-0,
 *   pointer-events:none; corners clipped by the root's overflow-hidden exactly
 *   as before — the old pseudo had no border-radius either).
 *   `dark:before:bg-transparent` reproduces how the `.dark .stat::before`
 *   `background` shorthand reset the per-tone tint colour, so tints stay
 *   light-mode-only, matching the current cascade.
 * - Tints: per-tone `before:bg-*` sets background-color beneath the sheen's
 *   background-image — same paint order as the old utility + shorthand combo.
 * - Text: value = text-fg; label/hint = text-fg-muted (the legacy light
 *   ink-500 exactly — fg-subtle would fail AA at 11px; dark renders one step
 *   brighter than the legacy #71717a, accepted harmonization); icon =
 *   text-fg-subtle (decorative); tone value colours keep brand-700 /
 *   accent-700 / emerald-700 / red-700 verbatim.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const statVariants = tv({
  slots: {
    root: [
      // shell — was `.stat` → `.card-elevated p-5 relative overflow-hidden`
      'relative overflow-hidden rounded-xl2 border border-border bg-surface p-5',
      'shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_1px_2px_rgba(20,21,17,0.04),0_8px_24px_-10px_rgba(20,21,17,0.10)]',
      'dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_2px_rgba(0,0,0,0.3),0_8px_24px_-10px_rgba(0,0,0,0.4)]',
      // sheen overlay — was `.stat::before` / `.dark .stat::before`
      "before:pointer-events-none before:absolute before:inset-0 before:content-['']",
      'before:bg-[linear-gradient(180deg,rgba(255,255,255,0.5)_0%,rgba(255,255,255,0)_50%)]',
      'dark:before:bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,transparent_50%)]',
      // the old dark `background` shorthand also wiped the tone tint colour
      'dark:before:bg-transparent',
    ],
    // children carry position:relative so they paint above the ::before sheen
    header: 'relative flex items-start justify-between gap-2',
    // label/hint use fg-muted, NOT fg-subtle: the legacy text-ink-500 IS the
    // light --fg-muted value, and fg-subtle (#898c80) only hits ~3.4:1 on white
    // — a WCAG AA failure for this 11px text. Dark renders one step brighter
    // than the legacy #71717a (accepted harmonization with Card's subtitle).
    label: 'mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted',
    icon: 'text-fg-subtle',
    value: 'relative font-display text-[1.75rem] leading-none',
    hint: 'relative mt-2 text-xs text-fg-muted',
  },
  variants: {
    tone: {
      default: { value: 'text-fg' },
      brand: { root: 'before:bg-brand-500/[0.04]', value: 'text-brand-700' },
      accent: { root: 'before:bg-accent-500/[0.05]', value: 'text-accent-700' },
      success: { root: 'before:bg-emerald-500/[0.05]', value: 'text-emerald-700' },
      danger: { root: 'before:bg-red-500/[0.04]', value: 'text-red-700' },
    },
  },
  defaultVariants: {
    tone: 'default',
  },
})

export type StatVariants = VariantProps<typeof statVariants>
export type StatTone = NonNullable<StatVariants['tone']>
