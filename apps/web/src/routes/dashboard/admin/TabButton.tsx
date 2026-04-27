export default function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
        active
          ? 'border-ink-900 text-ink-900'
          : 'border-transparent text-ink-500 hover:text-ink-900 hover:border-ink-200'
      }`}
    >
      {children}
    </button>
  )
}
