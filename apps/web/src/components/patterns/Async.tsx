import type { ReactNode } from 'react'
import { EmptyState, Alert, Button } from '../ui'
import ListSkeleton from '../ListSkeleton'

export interface AsyncProps<T> {
  /** Resolved data, or `undefined` while loading / before first resolve. */
  data: T | undefined
  /** Error thrown by the fetch, if any. */
  error?: unknown
  /** True on the first load (pass SWR's `isLoading`). */
  isLoading: boolean
  /** Invoked by the error state's retry button — e.g. SWR `mutate`. */
  onRetry?: () => void
  /** Custom loading fallback. Defaults to a content-shaped skeleton. */
  loading?: ReactNode
  /** Custom empty state. Defaults to a generic <EmptyState>. */
  empty?: ReactNode
  /** Override emptiness detection. Defaults to `Array.isArray(data) && length === 0`. */
  isEmpty?: (data: T) => boolean
  /** Render the resolved data. */
  children: (data: T) => ReactNode
}

/**
 * Declarative loading → error → empty → data boundary. Standardises how every
 * read view renders its async states so we stop hand-rolling
 * `data == null ? <Skeleton/> : data.length === 0 ? <Empty/> : …` per route.
 *
 * Pairs directly with useQuery():
 *
 *   const { data, error, isLoading, mutate } = useQuery(key, fetcher)
 *   <Async data={data} error={error} isLoading={isLoading} onRetry={mutate}>
 *     {(rows) => <List rows={rows} />}
 *   </Async>
 *
 * Because useQuery sets `keepPreviousData`, `data` stays defined across
 * pagination/filter changes, so this won't flash a skeleton on refetch.
 */
export function Async<T>({
  data,
  error,
  isLoading,
  onRetry,
  loading,
  empty,
  isEmpty,
  children,
}: AsyncProps<T>) {
  const nothingYet = data === undefined

  // Error wins only when there's nothing already on screen.
  if (error && nothingYet) {
    const message = error instanceof Error ? error.message : 'Something went wrong.'
    return (
      <Alert tone="red" title="Couldn’t load this">
        <p className="mb-2">{message}</p>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Alert>
    )
  }

  if (isLoading || nothingYet) {
    return <>{loading !== undefined ? loading : <ListSkeleton rows={3} />}</>
  }

  const showEmpty = isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0
  if (showEmpty) {
    return <>{empty !== undefined ? empty : <EmptyState title="Nothing here yet" />}</>
  }

  return <>{children(data)}</>
}
