/**
 * DataList — presentational responsive list, generic over the row type.
 *
 * One column model renders twice: a semantic <table> at md+ (thead with
 * scope="col" headers, sr-only <caption>) and a stack of label/value cards
 * below md. Purely presentational — no fetching, sorting or pagination.
 *
 * Async pairing: DataList pairs with <Async> (src/components/patterns/Async)
 * for the loading → error → empty → data lifecycle —
 *
 *   <Async data={data} error={error} isLoading={isLoading} onRetry={mutate}>
 *     {(rows) => <DataList columns={columns} rows={rows} rowKey={(r) => r.id} />}
 *   </Async>
 *
 * — or, when you want the states inline, fill the `loading` / `empty` slots
 * directly (e.g. `loading={isLoading && <ListSkeleton />}`). DataList renders
 * whatever the slot holds; it never invents its own skeleton or empty state.
 *
 * Keyboard/AT mechanism for clickable rows: rows stay a semantic <tr> — a
 * role="button" swap would detach the cells from their column headers for
 * assistive tech — so activation is provided by making each row focusable
 * (tabIndex=0) and activating on Enter/Space, with click/keys originating on
 * interactive descendants (links, buttons, inputs…) ignored so per-cell
 * actions don't also fire the row. The mobile card <li> uses the identical
 * mechanism. Focus visibility comes from the global :focus-visible outline
 * (index.css @layer base) — nothing here duplicates or suppresses it. For
 * full screen-reader affordance, also expose the row's primary action as a
 * real link/button inside a cell.
 */
import type { KeyboardEvent, MouseEvent, ReactNode, SyntheticEvent } from 'react'
import { cn } from '../../lib/cn'
import { dataListVariants, dataListHideBelow } from './DataList.variants'

export interface DataListColumn<T> {
  /** Stable column id. Doubles as the row property to read when `render` is omitted. */
  key: string
  /** Column header — table <th> content and mobile card label. */
  header: ReactNode
  /** Cell content. Defaults to reading `row[key]` off the row object. */
  render?: (row: T) => ReactNode
  /** Extra classes for the table header/cell and the card value (e.g. 'text-right', 'w-24'). */
  className?: string
  /**
   * Hide this column below the given breakpoint. The table only exists at md+
   * so this shapes the mobile cards: 'sm' hides the pair on the narrowest
   * screens only; 'md' makes the column table-only (never shown in cards).
   */
  hideBelow?: 'sm' | 'md'
}

export interface DataListProps<T> {
  columns: DataListColumn<T>[]
  rows: T[]
  /** Stable identity per row — the React key in both presentations. */
  rowKey: (row: T) => string | number
  /** When set, rows become clickable and keyboard-activatable (Enter/Space). */
  onRowClick?: (row: T) => void
  /** Rendered when `rows` is empty (and not loading) — e.g. an <EmptyState>. Renders nothing if omitted. */
  empty?: ReactNode
  /** While truthy, rendered in place of the list — e.g. a skeleton. See the <Async> pairing note above. */
  loading?: ReactNode
  /** Accessible name: sr-only <caption> on the table, aria-label on the card list. */
  caption?: string
  className?: string
}

/** True when the event originated on an interactive descendant (a per-cell
 *  action) — row activation must not double-fire on top of it. */
function isInteractiveChildEvent(e: SyntheticEvent<HTMLElement>): boolean {
  if (!(e.target instanceof Element)) return false
  const control = e.target.closest(
    'a,button,input,select,textarea,summary,label,[role="button"],[role="menuitem"],[role="switch"],[role="checkbox"],[tabindex],[contenteditable="true"]',
  )
  return control !== null && control !== e.currentTarget && e.currentTarget.contains(control)
}

/** Default cell content when a column has no `render`: the row property named by `key`. */
function cellContent<T>(col: DataListColumn<T>, row: T): ReactNode {
  if (col.render) return col.render(row)
  const value = (row as Record<string, unknown>)[col.key]
  return value == null ? null : (value as ReactNode)
}

export function DataList<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading,
  caption,
  className,
}: DataListProps<T>) {
  const interactive = onRowClick !== undefined
  const slots = dataListVariants({ interactive })
  // Caller className last so it wins via twMerge.
  const rootCls = cn(slots.root(), className)

  /** Focus + click + Enter/Space activation for a row/card (see doc comment). */
  function activationProps(row: T) {
    const activate = onRowClick
    if (!activate) return undefined
    return {
      tabIndex: 0,
      onClick: (e: MouseEvent<HTMLElement>) => {
        if (isInteractiveChildEvent(e)) return
        activate(row)
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if (isInteractiveChildEvent(e)) return
        e.preventDefault() // keep Space from scrolling the page
        activate(row)
      },
    }
  }

  if (loading) return <div className={rootCls}>{loading}</div>
  if (rows.length === 0) {
    return empty != null ? <div className={rootCls}>{empty}</div> : null
  }

  return (
    <div className={rootCls}>
      {/* Desktop: semantic table (md+). */}
      <div className={slots.tableWrap()}>
        <table className={slots.table()}>
          {caption && <caption className={slots.caption()}>{caption}</caption>}
          <thead>
            <tr className={slots.headRow()}>
              {columns.map((col) => (
                <th key={col.key} scope="col" className={cn(slots.headCell(), col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={slots.row()} {...activationProps(row)}>
                {columns.map((col) => (
                  <td key={col.key} className={cn(slots.cell(), col.className)}>
                    {cellContent(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per row (<md). role="list" restores list semantics
          that preflight's `list-style: none` strips in some screen readers. */}
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- intentional: Tailwind preflight sets list-style:none, which drops the implicit list role in VoiceOver/Safari; the explicit role restores it. */}
      <ul className={slots.cardList()} role="list" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={slots.card()} {...activationProps(row)}>
            <dl className={slots.cardPairs()}>
              {columns.map((col) => (
                <div
                  key={col.key}
                  className={cn(slots.cardPair(), col.hideBelow && dataListHideBelow[col.hideBelow])}
                >
                  <dt className={slots.cardLabel()}>{col.header}</dt>
                  <dd className={cn(slots.cardValue(), col.className)}>{cellContent(col, row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
DataList.displayName = 'DataList'
