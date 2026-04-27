export default function LoadingSpinner({ full = false }: { full?: boolean }) {
  const dot = (
    <svg
      className="animate-spin text-ink-900"
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <title>Loading</title>
    </svg>
  )
  if (full) {
    return <div className="min-h-screen flex items-center justify-center">{dot}</div>
  }
  return <div className="flex justify-center py-12">{dot}</div>
}
