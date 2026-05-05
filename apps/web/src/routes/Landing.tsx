import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../state/useSession'
import { useSeo } from '../lib/useSeo'

/**
 * Landing is intentionally minimal: two icons, one decision.
 *   Diamond   → "I'm a talent"       → /start/talent
 *   Magnifier → "I'm hiring"         → /start/hiring
 * Waitlist, marketing copy, and secondary nav live one click deeper.
 *
 * Logged-in users hitting `/` bypass the picker and go straight to their
 * role home (RoleHome in App.tsx resolves the right dashboard).
 */
export default function Landing() {
  const { t } = useTranslation()
  const { session, profile, loading } = useSession()
  useSeo({
    title: 'Three matches, zero noise',
    description: 'DNJ — curated recruitment that matches talent and leaders in Malaysia. Three matches, zero noise.',
  })
  // Only redirect into the app once we have BOTH session and profile.
  // session-but-no-profile means useSession is signing out an orphan session.
  if (!loading && session && profile) return <Navigate to="/home" replace />

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <header className="px-6 py-5">
        <Link to="/" className="inline-flex items-center gap-2" aria-label="DNJ home">
          <Logo />
          <span className="font-sans font-semibold text-xl text-ink-900">DNJ</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-12 md:mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-medium mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500" /> {t('landing.pilot')}
            </div>
            <h1 className="font-display text-display-sm md:text-display text-ink-900 mb-3">
              {t('landing.title')}
            </h1>
            <p className="text-ink-500 md:text-lg">
              {t('landing.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            <Link
              to="/start/talent"
              className="group relative bg-white border border-ink-200 rounded-xl2 p-10 text-center shadow-soft hover:shadow-card hover:border-ink-300 transition-all"
            >
              <div className="h-24 w-24 mx-auto mb-5 flex items-center justify-center text-brand-700 group-hover:scale-105 transition-transform">
                <DiamondIcon />
              </div>
              <h2 className="font-display text-2xl text-ink-900 mb-2">{t('landing.talent')}</h2>
              <p className="text-sm text-ink-500">
                {t('landing.talentDesc')}
              </p>
              <div className="mt-5 text-sm font-medium text-brand-700 inline-flex items-center gap-1">
                {t('common.continue')} <Arrow />
              </div>
            </Link>

            <Link
              to="/start/hiring"
              className="group relative bg-white border border-ink-200 rounded-xl2 p-10 text-center shadow-soft hover:shadow-card hover:border-ink-300 transition-all"
            >
              <div className="h-24 w-24 mx-auto mb-5 flex items-center justify-center text-ink-700 group-hover:scale-105 transition-transform">
                <FindDiamondIcon />
              </div>
              <h2 className="font-display text-2xl text-ink-900 mb-2">{t('landing.hiring')}</h2>
              <p className="text-sm text-ink-500">
                {t('landing.hiringDesc')}
              </p>
              <div className="mt-5 text-sm font-medium text-ink-700 inline-flex items-center gap-1">
                {t('common.continue')} <Arrow />
              </div>
            </Link>
          </div>

          <div className="mt-10 text-center text-xs text-ink-500">
            {t('landing.haveAccount')}{' '}
            <Link to="/login" className="font-medium text-ink-800 hover:text-brand-700 underline underline-offset-2">{t('common.signIn')}</Link>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-ink-500">
        <div className="space-x-3">
          <Link to="/privacy" className="hover:text-ink-900">{t('footer.privacy')}</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-ink-900">{t('footer.terms')}</Link>
          <span>·</span>
          <span>© 2026 DNJ</span>
        </div>
      </footer>
    </div>
  )
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="land-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a2260" />
          <stop offset="1" stopColor="#3e4fd3" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#land-logo-grad)" />
      <polygon points="7,15 16,5 25,15" fill="rgba(245,247,255,0.18)" stroke="#f5f7ff" strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="7" y1="15" x2="25" y2="15" stroke="#f5f7ff" strokeWidth="1" opacity="0.7" />
      <polygon points="7,15 25,15 16,28" fill="rgba(245,247,255,0.32)" stroke="#f5f7ff" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="13" cy="10" r="1" fill="#f5f7ff" opacity="0.75" />
    </svg>
  )
}

function DiamondIcon() {
  return (
    <svg width="90" height="90" viewBox="0 0 90 90" fill="none" aria-hidden>
      <defs>
        <linearGradient id="gd1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a6b6ff" />
          <stop offset="1" stopColor="#3e4fd3" />
        </linearGradient>
        <linearGradient id="gd2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8edff" />
          <stop offset="1" stopColor="#5468ef" />
        </linearGradient>
      </defs>
      {/* Diamond crown */}
      <polygon points="20,32 45,10 70,32" fill="url(#gd2)" stroke="#27306e" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="20" y1="32" x2="70" y2="32" stroke="#27306e" strokeWidth="1.5" />
      {/* Diamond pavilion */}
      <polygon points="20,32 70,32 45,78" fill="url(#gd1)" stroke="#27306e" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Facets */}
      <line x1="34" y1="10" x2="34" y2="32" stroke="#27306e" strokeWidth="1" opacity="0.5" />
      <line x1="45" y1="10" x2="45" y2="32" stroke="#27306e" strokeWidth="1" opacity="0.5" />
      <line x1="56" y1="10" x2="56" y2="32" stroke="#27306e" strokeWidth="1" opacity="0.5" />
      <line x1="34" y1="32" x2="45" y2="78" stroke="#27306e" strokeWidth="1" opacity="0.4" />
      <line x1="56" y1="32" x2="45" y2="78" stroke="#27306e" strokeWidth="1" opacity="0.4" />
      {/* Sparkle */}
      <circle cx="40" cy="20" r="1.5" fill="#f5f7ff" opacity="0.9" />
      <circle cx="52" cy="24" r="1" fill="#f5f7ff" opacity="0.8" />
    </svg>
  )
}

function FindDiamondIcon() {
  return (
    <svg width="90" height="90" viewBox="0 0 90 90" fill="none" aria-hidden>
      <defs>
        <linearGradient id="fg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bbbdb5" />
          <stop offset="1" stopColor="#5d5f55" />
        </linearGradient>
      </defs>
      {/* Magnifier glass */}
      <circle cx="38" cy="38" r="24" fill="#f8f8f7" stroke="#22231f" strokeWidth="3" />
      <circle cx="38" cy="38" r="24" fill="url(#fg1)" opacity="0.12" />
      {/* Inner diamond (smaller, muted) */}
      <polygon points="26,34 38,24 50,34" fill="#a6b6ff" stroke="#27306e" strokeWidth="1.25" strokeLinejoin="round" />
      <polygon points="26,34 50,34 38,52" fill="#5468ef" stroke="#27306e" strokeWidth="1.25" strokeLinejoin="round" />
      <line x1="26" y1="34" x2="50" y2="34" stroke="#27306e" strokeWidth="1" />
      <line x1="32" y1="24" x2="32" y2="34" stroke="#27306e" strokeWidth="0.8" opacity="0.5" />
      <line x1="44" y1="24" x2="44" y2="34" stroke="#27306e" strokeWidth="0.8" opacity="0.5" />
      {/* Handle */}
      <line x1="56" y1="56" x2="78" y2="78" stroke="#22231f" strokeWidth="5" strokeLinecap="round" />
      <line x1="56" y1="56" x2="60" y2="60" stroke="#464840" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

function Arrow() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M2 7h10m0 0L8 3m4 4L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
