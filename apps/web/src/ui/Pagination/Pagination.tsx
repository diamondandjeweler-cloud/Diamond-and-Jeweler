/**
 * Pagination — numbered page navigation with Prev/Next steppers and ellipsis
 * truncation. No Radix — a plain <nav> over real <button> elements.
 *
 * Controlled: the caller owns `page` (1-based) and receives requests via
 * `onPageChange`; the component keeps no internal page state. The visible
 * window follows the classic sibling algorithm — first and last pages always
 * render, `siblingCount` pages hug the current one, collapsed gaps become
 * ellipses — with a constant slot count so the control never changes width
 * while paging. Renders nothing at all when `pageCount <= 1`.
 *
 * a11y: <nav aria-label="Pagination"> (overridable via props); every control
 * is a native <button type="button">, so keyboard operation and the global
 * :focus-visible outline (index.css @layer base) come for free; the current
 * page carries aria-current="page"; Prev/Next are icon-only with aria-labels
 * and disable at the bounds; SVGs and ellipses are decorative (aria-hidden).
 */
import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import {
  paginationVariants,
  paginationItemVariants,
  paginationEllipsisVariants,
  type PaginationItemVariantProps,
} from './Pagination.variants'

/** Derived from the variant map so the public type can't drift from the styles. */
export type PaginationItemState = NonNullable<PaginationItemVariantProps['state']>

export interface PaginationProps extends HTMLAttributes<HTMLElement> {
  /** Current page, 1-based. Clamped to [1, pageCount] for rendering. */
  page: number
  /** Total number of pages. At 1 or below the component renders nothing. */
  pageCount: number
  /** Called with the requested 1-based page (never the current one). */
  onPageChange: (page: number) => void
  /** Pages shown on each side of the current page. Default 1. */
  siblingCount?: number
}

const ELLIPSIS = 'ellipsis' as const
type PageItem = number | typeof ELLIPSIS

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

/**
 * Sibling-window truncation. Slot budget = first + last + current +
 * 2·siblingCount neighbours + the two slots ellipses occupy, held constant
 * across every case so the rendered width is stable while paging.
 */
function getPageItems(page: number, pageCount: number, siblingCount: number): PageItem[] {
  const totalSlots = 2 * siblingCount + 5
  if (pageCount <= totalSlots) return range(1, pageCount)

  const showLeftEllipsis = page - siblingCount > 2
  const showRightEllipsis = page + siblingCount < pageCount - 1

  if (!showLeftEllipsis && showRightEllipsis) {
    // Near the start: 1 … (totalSlots - 2) | … | last
    return [...range(1, totalSlots - 2), ELLIPSIS, pageCount]
  }
  if (showLeftEllipsis && !showRightEllipsis) {
    // Near the end: first | … | (totalSlots - 2) trailing pages
    return [1, ELLIPSIS, ...range(pageCount - (totalSlots - 3), pageCount)]
  }
  // Mid-range: first | … | sibling window | … | last
  return [1, ELLIPSIS, ...range(page - siblingCount, page + siblingCount), ELLIPSIS, pageCount]
}

export const Pagination = forwardRef<HTMLElement, PaginationProps>(
  ({ page, pageCount, onPageChange, siblingCount = 1, className, ...rest }, ref) => {
    // A single page needs no navigation — hide entirely.
    if (pageCount <= 1) return null

    const current = Math.min(Math.max(1, Math.trunc(page)), pageCount)
    const items = getPageItems(current, pageCount, Math.max(0, Math.trunc(siblingCount)))

    return (
      <nav
        ref={ref}
        aria-label="Pagination"
        className={cn(paginationVariants(), className)}
        {...rest}
      >
        <button
          type="button"
          className={paginationItemVariants()}
          aria-label="Previous page"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeftIcon />
        </button>

        {items.map((item, index) =>
          item === ELLIPSIS ? (
            <span key={`ellipsis-${index}`} aria-hidden className={paginationEllipsisVariants()}>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={paginationItemVariants({ state: item === current ? 'current' : 'default' })}
              aria-label={`Page ${item}`}
              aria-current={item === current ? 'page' : undefined}
              onClick={() => {
                if (item !== current) onPageChange(item)
              }}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          className={paginationItemVariants()}
          aria-label="Next page"
          disabled={current >= pageCount}
          onClick={() => onPageChange(current + 1)}
        >
          <ChevronRightIcon />
        </button>
      </nav>
    )
  },
)
Pagination.displayName = 'Pagination'

/** Decorative stepper glyphs — labelling lives on the buttons (aria-label). */
function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
