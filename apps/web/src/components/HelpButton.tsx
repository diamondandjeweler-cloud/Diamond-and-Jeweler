import { Link, useLocation } from 'react-router-dom'

export default function HelpButton() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/support')) return null

  return (
    <Link
      to="/support"
      aria-label="Help and feedback"
      title="Help & feedback"
      className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 hover:scale-105 transition-all flex items-center justify-center ring-2 ring-white"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      </svg>
    </Link>
  )
}
