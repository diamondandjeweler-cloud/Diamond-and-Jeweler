export interface SkeletonProps {
  className?: string
  width?: number | string
  height?: number | string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
  ariaLabel?: string
}

export default function Skeleton({
  className = '',
  width,
  height,
  rounded = 'md',
  ariaLabel = 'Loading',
}: SkeletonProps) {
  const radius =
    rounded === 'full' ? 'rounded-full' :
    rounded === 'lg'   ? 'rounded-lg'   :
    rounded === 'sm'   ? 'rounded-sm'   :
                         'rounded-md'
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      className={`dnj-skel animate-shimmer ${radius} ${className}`}
      style={{ width, height }}
    />
  )
}

/** Stack of N text lines — handy default. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? '60%' : '100%'}
          rounded="sm"
        />
      ))}
    </div>
  )
}

/** Card-shaped skeleton — same footprint as the dashboard offer cards. */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={`bg-white dark:bg-zinc-800 border border-ink-200 dark:border-zinc-700 rounded-xl2 shadow-soft p-6 ${className}`}
    >
      <div className="flex justify-between items-start mb-4 gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton height={20} width="70%" />
          <Skeleton height={10} width="40%" rounded="sm" />
        </div>
        <Skeleton width={48} height={48} rounded="full" />
      </div>
      <SkeletonText lines={3} />
      <div className="mt-5 flex gap-2">
        <Skeleton width={80} height={32} />
        <Skeleton width={80} height={32} />
      </div>
    </div>
  )
}
