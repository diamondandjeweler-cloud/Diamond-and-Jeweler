/**
 * DataList variants — tailwind-variants recipe for the responsive list
 * primitive: one column model rendered as a semantic <table> at md+ and as
 * stacked label/value cards below md.
 *
 * Every color is a semantic token (bg-surface / bg-surface-2 / border-border /
 * text-fg / text-fg-muted — see src/ui/tokens.css), so both presentations flip
 * automatically under `.dark` with zero `dark:` utilities. Header cells and
 * card labels reuse the library's micro-label treatment (text-[11px]
 * font-semibold uppercase tracking-[0.1em] text-fg-muted — same as the Stat
 * label), so tables, cards and stat tiles read as one system.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const dataListVariants = tv({
  slots: {
    root: 'w-full',

    /* ── Desktop presentation (md+) ──────────────────────────────────── */
    // Wide tables scroll inside this wrapper instead of the page.
    tableWrap: 'hidden md:block overflow-x-auto',
    table: 'w-full border-collapse text-left text-sm text-fg',
    caption: 'sr-only',
    headRow: 'border-b border-border',
    headCell: 'px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted',
    row: 'border-b border-border',
    cell: 'px-4 py-3 align-middle',

    /* ── Mobile presentation (<md) ───────────────────────────────────── */
    cardList: 'flex flex-col gap-3 md:hidden',
    card: 'bg-surface border border-border rounded-xl2 shadow-soft p-4',
    // <dl> of label/value pairs inside each card.
    cardPairs: 'flex flex-col gap-2',
    cardPair: 'flex items-baseline justify-between gap-4',
    cardLabel: 'shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted',
    cardValue: 'min-w-0 text-right text-sm text-fg',
  },
  variants: {
    /** Row-activation affordances — applied only when `onRowClick` is set. */
    interactive: {
      true: {
        // Table rows tint on hover — cells hold text-fg (≈9:1 on surface-2 in
        // dark), so it stays AA. Mobile cards do NOT tint: the card also holds
        // 11px text-fg-muted labels, which drop to ~4.07:1 on surface-2 in dark
        // (below the 4.5:1 small-text floor). border-strong + cursor is
        // affordance enough without a failing background.
        row: 'cursor-pointer transition-colors hover:bg-surface-2',
        card: 'cursor-pointer transition-colors hover:border-border-strong',
      },
    },
  },
  defaultVariants: { interactive: false },
})

/**
 * `hideBelow` → responsive display classes for a mobile card pair (the table
 * cells never need them: the table only exists at md+, above both breakpoints).
 * The card list renders below md only, so:
 *   'sm' → pair hidden on the narrowest screens, visible in the sm–md band;
 *   'md' → `md:flex` can never re-apply inside the md:hidden card list, so the
 *          column is effectively table-only.
 */
export const dataListHideBelow: Record<'sm' | 'md', string> = {
  sm: 'hidden sm:flex',
  md: 'hidden md:flex',
}

export type DataListVariantProps = VariantProps<typeof dataListVariants>
