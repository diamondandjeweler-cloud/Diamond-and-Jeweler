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
          ? 'border-ink-900 dark:border-white text-ink-900 dark:text-white'
          : 'border-transparent text-ink-500 dark:text-gray-400 hover:text-ink-900 dark:hover:text-white hover:border-ink-200 dark:hover:border-gray-600'
      }`}
    >
      {children}
    </button>
  )
}
