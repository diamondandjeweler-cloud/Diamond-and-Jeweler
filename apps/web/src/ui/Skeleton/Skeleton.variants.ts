/**
 * Skeleton composition variants — layout recipes for the content-shaped
 * loading placeholders in Skeleton.tsx.
 *
 * No shimmer is defined here. Every bone reuses the existing shimmer primitive
 * (components/Skeleton default export), whose `.dnj-skel` class in src/index.css
 * is the single dark-aware shimmer source — light + `.dark` gradients live
 * there, and prefers-reduced-motion is neutralised globally there too. These
 * slots only reproduce the BOXES of the real ui primitives, so a
 * skeleton → content swap causes no layout shift:
 *
 * - card / cardHeader / cardBody mirror Card.variants.ts: the card shell
 *   (bg-surface + border-border + rounded-xl2 + resting shadow-soft),
 *   CardHeader's `px-6 pt-6 pb-3` header row and CardBody's `p-6`.
 * - stat mirrors Stat.variants.ts root: the elevated tile shell (`p-5` +
 *   the `.card-elevated` shadow recipe). The decorative ::before sheen is
 *   deliberately omitted — it has zero layout impact and would only add more
 *   non-token treatments to a throwaway placeholder.
 * - row mirrors the admin/data-list row recipe already established by
 *   components/ListSkeleton (variant="row"), re-based onto semantic tokens.
 *
 * Column containers are `flex flex-col` rather than `space-y-*`: the bones
 * carry their own line-box margins (`my-1` etc. — see Skeleton.tsx), and flex
 * prevents those margins from collapsing, keeping each stand-in line exactly
 * the height of the text line it replaces.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const skeletonVariants = tv({
  slots: {
    // aria-hidden wrapper around the bones: display:contents contributes no
    // box of its own, so the bones lay out as direct children of the
    // composition root (root flex/gap still applies to them) while the whole
    // group stays out of the a11y tree — each base bone is its own
    // role="status" div, and only the composition root should announce.
    bits: 'contents',

    /** Paragraph stand-in. Bones add `my-1` so each line box is exactly the
     *  20px line box of `text-sm` (12px bar + 4px above/below). */
    text: 'flex flex-col',

    /** Card shell = cardVariants base + resting shadow (elevated: false). */
    card: 'bg-surface border border-border rounded-xl2 shadow-soft',
    /** = cardHeaderVariants root (`flex items-start justify-between gap-4 px-6 pt-6 pb-3`). */
    cardHeader: 'flex items-start justify-between gap-4 px-6 pt-6 pb-3',
    cardHeaderBody: 'min-w-0 flex-1 flex flex-col',
    /** = cardBodyVariants (`p-6`). */
    cardBody: 'p-6 flex flex-col',

    /** Data-list row — tokenized twin of ListSkeleton's `row` variant
     *  (bg-white/zinc-800 + ink-200/zinc-700 there → bg-surface + border-border here). */
    row: 'flex items-center gap-3 bg-surface border border-border rounded-md px-4 py-3',
    rowBody: 'min-w-0 flex-1 flex flex-col gap-2',

    /** Standalone Avatar root — shrink-wraps the sized bone inside. */
    avatarRoot: 'inline-block',
    /** The avatar bone itself; size classes come from the avatarSize variant. */
    avatar: 'shrink-0',

    stat: [
      // Tile shell — matches Stat.variants root (minus the decorative sheen):
      // `.card-elevated p-5` on semantic tokens.
      'flex flex-col rounded-xl2 border border-border bg-surface p-5',
      // The elevated box-shadow recipe has no theme-flipping token
      // (shadow-soft/card/float are light-tuned statics), so — exactly like
      // Card.variants / Stat.variants — the dark treatment keeps an explicit
      // dark: arbitrary shadow, a byte-copy of the legacy `.dark .card-elevated`
      // override (dimmed inset highlight, deeper black ambient).
      'shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_1px_2px_rgba(20,21,17,0.04),0_8px_24px_-10px_rgba(20,21,17,0.10)]',
      'dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_2px_rgba(0,0,0,0.3),0_8px_24px_-10px_rgba(0,0,0,0.4)]',
    ],
  },
  variants: {
    /** Sizes shared by Skeleton.Avatar and the optional leading avatar in Skeleton.Row. */
    avatarSize: {
      sm: { avatar: 'h-8 w-8' },
      md: { avatar: 'h-10 w-10' },
      lg: { avatar: 'h-12 w-12' },
    },
  },
  defaultVariants: { avatarSize: 'md' },
})

export type SkeletonVariantProps = VariantProps<typeof skeletonVariants>
export type SkeletonAvatarSize = NonNullable<SkeletonVariantProps['avatarSize']>
