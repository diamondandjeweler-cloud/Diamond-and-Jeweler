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
          ? 'border-ink-900 dark:border-white text-fg'
          : 'border-transparent text-fg-muted hover:text-fg hover:border-ink-200 dark:hover:border-border-strong'
      }`}
    >
      {children}
    </button>
  )
}
