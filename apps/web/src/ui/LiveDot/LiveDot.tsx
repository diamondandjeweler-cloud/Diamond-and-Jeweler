/**
 * LiveDot — a pulsing "live" indicator dot with an optional label.
 *
 * Moved verbatim from components/ui.tsx (same props and className strings; DOM
 * output byte-identical). components/ui re-exports this via a thin deprecated
 * shim.
 */
export function LiveDot({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-emerald-700">
      <span className="live-dot" />
      {label}
    </span>
  )
}
