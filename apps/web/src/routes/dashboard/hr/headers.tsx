/** Small presentational section/sub-section headers shared across the HR
 *  dashboard sub-views. Relocated verbatim from HRDashboard.tsx. */

export function SectionHeader({
  title, subtitle, count, action,
}: {
  title: string
  subtitle?: string
  count?: number
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-xl text-ink-900">{title}</h2>
          {typeof count === 'number' && <span className="text-sm text-ink-400">{count}</span>}
        </div>
        {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function SubHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 mb-4 mt-2">
      <h3 className="font-display text-lg text-ink-800">{title}</h3>
      <span className="text-sm text-ink-400">{count}</span>
    </div>
  )
}
