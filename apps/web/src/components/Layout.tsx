import { Link, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../state/useSession'
import NotificationBell from './NotificationBell'
import SupportForm from './SupportForm'

export default function Layout() {
  const { profile, signOut, isHM } = useSession()
  const { pathname } = useLocation()

  const navItems = navForRole(profile?.role, pathname, { isHM })

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-ink-900 text-white px-3 py-2 rounded z-50 text-sm"
      >
        Skip to main content
      </a>

      <header className="app-shell-header" role="banner">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Link
              to="/home"
              aria-label="DNJ home"
              className="flex items-center gap-2.5 group"
            >
              <Logo />
              <span className="font-sans font-semibold text-xl text-ink-900 tracking-tight group-hover:text-brand-700 transition-colors">DNJ</span>
            </Link>

            {navItems.length > 0 && (
              <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
                {navItems.map((n) => (
                  <Link
                    key={n.href}
                    to={n.href}
                    className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      n.active
                        ? 'text-ink-900 bg-ink-100'
                        : 'text-ink-500 hover:text-ink-900 hover:bg-ink-50'
                    }`}
                  >
                    {n.label}
                    {n.badge && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded text-[10px] font-bold bg-accent-500 text-white">
                        {n.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3" aria-label="User navigation">
{profile?.role === 'talent' && profile?.points != null && (
              <Link to="/points" className="hidden sm:inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-accent-500/10 text-accent-600 ring-1 ring-accent-500/20 hover:bg-accent-500/15">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.5L12 16.9 5.8 21.4l2.4-7.5L2 9.4h7.6L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                {profile.points} Diamond Points
              </Link>
            )}
            <NotificationBell />
            {profile && (
              <div className="hidden sm:flex items-center gap-2.5 text-sm pl-3 border-l border-ink-200">
                <Avatar name={profile.full_name} />
                <div className="leading-tight">
                  <div className="text-ink-900 font-medium">{profile.full_name}</div>
                  <div className="text-[11px] text-ink-500 capitalize tracking-wide">{profile.role.replace('_', ' ')}</div>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="btn-ghost btn-sm"
            >
              Sign out
            </button>
          </div>
        </div>

        {navItems.length > 0 && (
          <nav className="md:hidden border-t border-ink-100 overflow-x-auto bg-white/80 backdrop-blur" aria-label="Primary mobile" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex gap-1 px-4 py-2 whitespace-nowrap">
              {navItems.map((n) => (
                <Link
                  key={n.href}
                  to={n.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                    n.active ? 'bg-ink-100 text-ink-900' : 'text-ink-500'
                  }`}
                >
                  {n.label}
                  {n.badge && (
                    <span className="ml-1 inline-flex items-center px-1 py-0 rounded text-[10px] font-bold bg-accent-500 text-white">
                      {n.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-8 md:py-10" role="main">
        <Outlet />
      </main>

      <SupportForm />

      <footer className="border-t border-ink-200 bg-white/60 backdrop-blur py-6 mt-8" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-ink-500">
          <div className="flex items-center gap-2">
            <Logo small />
            <span>© 2026 DNJ · Curated recruitment for Malaysia</span>
          </div>
          {/* F20 — footer link tap targets bumped to 44×24 minimum (WCAG 2.2 AA).
              Adds vertical padding without changing the visual line. */}
          <div className="flex items-center gap-2 md:gap-4">
            <Link
              to="/privacy"
              className="hover:text-ink-900 transition-colors inline-flex items-center min-h-[44px] px-2 -mx-2"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="hover:text-ink-900 transition-colors inline-flex items-center min-h-[44px] px-2 -mx-2"
            >
              Terms
            </Link>
            <Link
              to="/data-requests"
              className="hover:text-ink-900 transition-colors inline-flex items-center min-h-[44px] px-2 -mx-2"
            >
              Data requests
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function navForRole(role: string | undefined, pathname: string, opts: { isHM?: boolean } = {}) {
  const linkFor = (href: string, label: string, badge?: string) => ({
    href, label, badge,
    active: pathname === href || (href !== '/home' && pathname.startsWith(href)),
  })
  const restaurantEnabled = import.meta.env.VITE_ENABLE_RESTAURANT === 'true'
  const restaurant = linkFor('/restaurant', 'Restaurant', 'DEV')
  if (role === 'talent') return [
    linkFor('/home', 'My offers'),
    linkFor('/talent/profile', 'Profile'),
  ]
  if (role === 'hiring_manager') return [
    linkFor('/hm', 'Candidates'),
    linkFor('/hm/roles', 'My roles'),
    linkFor('/hm/post-role', 'Post role'),
    linkFor('/hm/company', 'Company'),
    linkFor('/hm/settings', 'Settings'),
    linkFor('/hm/account', 'Account'),
  ]
  if (role === 'hr_admin') {
    const base = [
      linkFor('/hr', 'Scheduling'),
      linkFor('/hr/invite', 'Invite HM'),
    ]
    // Small-company case: HR self-registered as HM. Surface HM workspace
    // alongside the HR nav so they can switch contexts without URL gymnastics.
    if (opts.isHM) {
      return [
        ...base,
        linkFor('/hm', 'Candidates (HM)'),
        linkFor('/hm/roles', 'My roles'),
        linkFor('/hm/post-role', 'Post role'),
      ]
    }
    return base
  }
  if (role === 'admin') return restaurantEnabled
    ? [linkFor('/admin', 'Admin'), restaurant]
    : [linkFor('/admin', 'Admin')]
  if (role === 'restaurant_staff' && restaurantEnabled) return [restaurant]
  return []
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-xs font-semibold flex items-center justify-center shadow-soft ring-2 ring-white">
      {initials || '?'}
    </div>
  )
}

function Logo({ small }: { small?: boolean } = {}) {
  const size = small ? 18 : 28
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="layout-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a2260" />
          <stop offset="1" stopColor="#3e4fd3" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#layout-logo-grad)" />
      <polygon points="7,15 16,5 25,15" fill="rgba(245,247,255,0.18)" stroke="#f5f7ff" strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="7" y1="15" x2="25" y2="15" stroke="#f5f7ff" strokeWidth="1" opacity="0.7" />
      <polygon points="7,15 25,15 16,28" fill="rgba(245,247,255,0.32)" stroke="#f5f7ff" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="13" cy="10" r="1" fill="#f5f7ff" opacity="0.75" />
    </svg>
  )
}
