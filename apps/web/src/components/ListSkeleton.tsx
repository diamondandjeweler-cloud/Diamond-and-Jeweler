import Skeleton from './Skeleton'

/**
 * Generic list/table placeholder. Use as the fallback while a list-shaped
 * data slot is null:
 *
 *   {data == null ? <ListSkeleton rows={3} variant="card" /> :
 *    data.length === 0 ? <EmptyState ... /> :
 *    data.map(...)}
 */
export interface ListSkeletonProps {
  /** Number of skeleton rows / cards to render. Default 3. */
  rows?: number
  /** Visual layout. `card` ~ dashboard offer cards. `row` ~ admin table rows. */
  variant?: 'card' | 'row'
  /** Optional className to forward to the wrapper. */
  className?: string
}

export default function ListSkeleton({ rows = 3, variant = 'card', className = '' }: ListSkeletonProps) {
  if (variant === 'row') {
    return (
      <div className={`space-y-2 ${className}`} role="status" aria-busy="true" aria-label="Loading">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-md px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton width="65%" height={14} rounded="sm" />
              <Skeleton width="35%" height={10} rounded="sm" />
            </div>
            <Skeleton width={72} height={28} />
          </div>
        ))}
      </div>
    )
  }

  // Default = card variant.
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-xl2 shadow-soft p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 space-y-2">
              <Skeleton width="60%" height={18} />
              <Skeleton width="40%" height={11} rounded="sm" />
            </div>
            <Skeleton width={88} height={28} />
          </div>
          <Skeleton width="100%" height={10} rounded="sm" />
        </div>
      ))}
    </div>
  )
}

/**
 * Form placeholder. Renders N labelled "input" rows so the form layout is
 * stable while the existing record loads for edit. Pair with a real-looking
 * page header and submit button outside the skeleton.
 */
export function FormSkeleton({ fields = 6, className = '' }: { fields?: number; className?: string }) {
  return (
    <div className={`space-y-4 ${className}`} role="status" aria-busy="true" aria-label="Loading form">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton width={120} height={12} rounded="sm" />
          <Skeleton width="100%" height={40} />
        </div>
      ))}
    </div>
  )
}
