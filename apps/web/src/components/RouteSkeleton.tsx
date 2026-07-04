import Skeleton from './Skeleton'

/**
 * Route-shaped skeleton used as the Suspense fallback while lazy-loaded route
 * chunks download/parse. Sized to roughly match dashboard + landing layouts
 * so there's no layout shift when the real route mounts. Preferred over the
 * full-page spinner because users perceive "structure appearing" as far less
 * laggy than a centred circle on a blank page.
 *
 * Plain Tailwind — no Suspense-incompatible imports, no Supabase calls.
 */
export default function RouteSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#18181b]" role="status" aria-busy="true" aria-label="Loading">
      {/* Top bar — mirrors Layout.tsx header height/structure. */}
      <div className="h-16 border-b border-ink-200 dark:border-zinc-700 px-4 md:px-6 flex items-center gap-3">
        <Skeleton width={28} height={28} rounded="md" />
        <Skeleton width={64} height={18} rounded="sm" />
        <div className="hidden md:flex gap-2 ml-6">
          <Skeleton width={56} height={14} rounded="sm" />
          <Skeleton width={56} height={14} rounded="sm" />
          <Skeleton width={56} height={14} rounded="sm" />
        </div>
        <div className="ml-auto flex gap-2">
          <Skeleton width={28} height={28} rounded="full" />
          <Skeleton width={28} height={28} rounded="full" />
        </div>
      </div>

      {/* Content block — three-card row + paragraph, matches most dashboards. */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-4">
        <Skeleton height={28} width="50%" />
        <Skeleton height={14} width="90%" rounded="sm" />
        <Skeleton height={14} width="80%" rounded="sm" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <Skeleton height={140} />
          <Skeleton height={140} />
          <Skeleton height={140} />
        </div>

        <div className="mt-6 space-y-2">
          <Skeleton height={14} width="70%" rounded="sm" />
          <Skeleton height={14} width="55%" rounded="sm" />
        </div>
      </div>
    </div>
  )
}
