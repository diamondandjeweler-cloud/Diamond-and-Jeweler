/**
 * Skeleton — content-shaped loading placeholders for the ui-layer primitives.
 *
 * These are COMPOSITIONS, not a new shimmer. Every bone is the existing
 * components/Skeleton primitive: its `.dnj-skel` class (src/index.css) is the
 * single dark-aware shimmer source, and prefers-reduced-motion is neutralised
 * globally there — nothing here duplicates either. This module only arranges
 * bones into the exact boxes of the real ui primitives (Card + CardHeader +
 * CardBody, Stat, a data-list row) so that swapping a skeleton for the loaded
 * content causes no layout shift.
 *
 * A11y: each composition root is a single `role="status" aria-busy="true"`
 * region with an sr-only "Loading…" label. The bones (each a `role="status"`
 * div of its own, which the base primitive hard-codes) sit inside an
 * `aria-hidden` display:contents wrapper, so assistive tech hears exactly ONE
 * status per composition instead of a pile of nested ones. Purely
 * presentational — nothing is focusable, so there is no keyboard surface.
 *
 * Usage (the Async/null-data convention):
 *
 *   {stats == null ? <Skeleton.Stat /> : <Stat label=… value=… />}
 *   {profile == null ? <Skeleton.Card /> : <ProfileCard … />}
 *   <Skeleton.Text lines={2} />
 */
import type { ReactNode } from 'react'
// The existing shimmer primitive — aliased so this module can export its own
// `Skeleton` namespace object without shadowing it.
import Bone from '../../components/Skeleton'
import { cn } from '../../lib/cn'
import { skeletonVariants, type SkeletonAvatarSize } from './Skeleton.variants'

export type { SkeletonAvatarSize } from './Skeleton.variants'

/** Shared a11y shell: one polite status region per composition. */
function StatusRoot({ className, children }: { className?: string; children: ReactNode }) {
  const slots = skeletonVariants()
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Loading…</span>
      {/* aria-hidden hides the decorative bones from the a11y tree (each base
          bone hard-codes its own role="status"); the `bits` slot is
          display:contents, so this wrapper adds no layout box and the root's
          flex/gap classes apply directly to the bones. The sr-only span is
          absolutely positioned, so it never participates in that layout. */}
      <div aria-hidden="true" className={slots.bits()}>
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Text */

export interface SkeletonTextProps {
  /** Number of `text-sm` lines to stand in for. Default 3; the last line is 60% wide. */
  lines?: number
  className?: string
}

function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  const slots = skeletonVariants()
  return (
    <StatusRoot className={cn(slots.text(), className)}>
      {Array.from({ length: lines }).map((_, i) => (
        // 12px bar + my-1 inside the flex column = a 20px box per line, the
        // exact line box of text-sm — an n-line paragraph swap shifts nothing.
        <Bone key={i} className="my-1" height={12} width={i === lines - 1 ? '60%' : '100%'} rounded="sm" />
      ))}
    </StatusRoot>
  )
}
SkeletonText.displayName = 'Skeleton.Text'

/* ------------------------------------------------------------------ Card */

export interface SkeletonCardProps {
  className?: string
}

function SkeletonCard({ className }: SkeletonCardProps) {
  const slots = skeletonVariants()
  return (
    <StatusRoot className={cn(slots.card(), className)}>
      <div className={slots.cardHeader()}>
        <div className={slots.cardHeaderBody()}>
          {/* title: 20px bar centred in the 28px line box of CardHeader's text-xl <h2> */}
          <Bone className="my-1" height={20} width="40%" />
          {/* subtitle: 12px bar in text-sm's 20px box plus its mt-1 (8 + 12 + 4 = 24px) */}
          <Bone className="mt-2 mb-1" height={12} width="25%" rounded="sm" />
        </div>
        {/* right action slot — sized like a small button */}
        <Bone className="shrink-0" width={72} height={28} />
      </div>
      <div className={slots.cardBody()}>
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="my-1" height={12} width={i === 2 ? '60%' : '100%'} rounded="sm" />
        ))}
      </div>
    </StatusRoot>
  )
}
SkeletonCard.displayName = 'Skeleton.Card'

/* ------------------------------------------------------------------- Row */

export interface SkeletonRowProps {
  /** Lead the row with a circular avatar bone (md, 40px). */
  avatar?: boolean
  className?: string
}

function SkeletonRow({ avatar, className }: SkeletonRowProps) {
  const slots = skeletonVariants()
  return (
    <StatusRoot className={cn(slots.row(), className)}>
      {avatar && <Bone className={slots.avatar()} rounded="full" />}
      <div className={slots.rowBody()}>
        <Bone height={14} width="65%" rounded="sm" />
        <Bone height={10} width="35%" rounded="sm" />
      </div>
      {/* trailing action bone — same 72×28 footprint as ListSkeleton's row action */}
      <Bone className="shrink-0" width={72} height={28} />
    </StatusRoot>
  )
}
SkeletonRow.displayName = 'Skeleton.Row'

/* ---------------------------------------------------------------- Avatar */

export interface SkeletonAvatarProps {
  /** sm 32px · md 40px (default) · lg 48px — match the real avatar you replace. */
  size?: SkeletonAvatarSize
  className?: string
}

function SkeletonAvatar({ size = 'md', className }: SkeletonAvatarProps) {
  const slots = skeletonVariants({ avatarSize: size })
  return (
    <StatusRoot className={cn(slots.avatarRoot(), className)}>
      <Bone className={slots.avatar()} rounded="full" />
    </StatusRoot>
  )
}
SkeletonAvatar.displayName = 'Skeleton.Avatar'

/* ------------------------------------------------------------------ Stat */

export interface SkeletonStatProps {
  className?: string
}

function SkeletonStat({ className }: SkeletonStatProps) {
  const slots = skeletonVariants()
  return (
    <StatusRoot className={cn(slots.stat(), className)}>
      {/* label: 12px bar + mb-2.5 ≈ the 11px uppercase label's line box + mb-1.5 */}
      <Bone className="mb-2.5" height={12} width={80} rounded="sm" />
      {/* value: 28px bar = text-[1.75rem] leading-none exactly */}
      <Bone height={28} width="55%" />
      {/* hint: mt-3 + 12px bar ≈ the text-xs hint's mt-2 + 16px line box */}
      <Bone className="mt-3" height={12} width="50%" rounded="sm" />
    </StatusRoot>
  )
}
SkeletonStat.displayName = 'Skeleton.Stat'

/* ------------------------------------------------------------- namespace */

/**
 * Content-shaped skeleton compositions, one per ui primitive they stand in
 * for. Kept as a namespace object (Skeleton.Card, Skeleton.Stat, …) so call
 * sites read as "skeleton of X".
 */
export const Skeleton = {
  Text: SkeletonText,
  Card: SkeletonCard,
  Row: SkeletonRow,
  Avatar: SkeletonAvatar,
  Stat: SkeletonStat,
} as const
