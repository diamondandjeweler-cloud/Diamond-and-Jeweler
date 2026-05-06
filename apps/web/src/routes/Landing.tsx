import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../state/useSession'
import { useSeo } from '../lib/useSeo'

/**
 * Landing is intentionally minimal: two icons, one decision.
 *   Diamond   → "I'm a talent"       → /start/talent
 *   Magnifier → "I'm hiring"         → /start/hiring
 *
 * Logged-in users hitting `/` bypass the picker and go straight to their
 * role home (RoleHome in App.tsx resolves the right dashboard).
 */
export default function Landing() {
  const { t } = useTranslation()
  const { session, profile, loading } = useSession()
  useSeo({
    title: 'We connect brilliance with opportunity',
    description: 'DNJ — AI-curated recruitment that matches the right talent with the right company. Three matches, zero noise.',
  })
  if (!loading && session && profile) return <Navigate to="/home" replace />

  return (
    <div className="min-h-screen bg-white text-[#0B1220] relative overflow-hidden font-sans flex flex-col">
      {/* Subtle tech background */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #1B2A6B 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between px-6 md:px-10 py-6">
        <Link to="/" className="flex items-center gap-3" aria-label="DNJ home">
          <div className="w-9 h-9 border-2 border-[#1B2A6B] rotate-45" />
          <div className="text-xl font-semibold tracking-wide">DNJ</div>
          <div className="hidden sm:block text-xs text-gray-500 tracking-widest">DIAMOND &amp; JEWELER</div>
        </Link>

        <div className="inline-flex items-center gap-2 border border-gray-300 px-4 py-1.5 rounded-full text-sm text-gray-600 bg-white">
          <span className="h-1.5 w-1.5 rounded-full bg-[#C9A24D]" />
          {t('landing.pilot')}
        </div>
      </div>

      {/* Hero */}
      <div className="relative z-10 max-w-6xl mx-auto text-center mt-10 px-6">
        <div className="text-[#C9A24D] tracking-[0.3em] text-sm font-semibold mb-3">
          {t('landing.eyebrow').toUpperCase()}
        </div>

        <h1 className="font-sans text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight">
          {t('landing.titleLead')}{' '}
          <span className="text-[#C9A24D]">{t('landing.titleHighlight')}</span>
          <br /> {t('landing.titleTrail')}
        </h1>

        <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
          {t('landing.subtitle')}
        </p>
      </div>

      {/* Panels */}
      <div className="relative z-10 max-w-6xl mx-auto mt-20 grid md:grid-cols-2 gap-12 px-6 w-full">
        {/* Talent */}
        <Link
          to="/start/talent"
          className="block bg-white border border-gray-200 rounded-2xl p-10 shadow-xl hover:shadow-2xl transition"
        >
          <div className="flex justify-center mb-8">
            <div className="w-28 h-28 bg-gradient-to-b from-[#4F7BFF] to-[#1B2A6B] rotate-45" />
          </div>

          <h2 className="font-sans text-2xl font-semibold text-center mb-3">
            {t('landing.talent')}
          </h2>

          <p className="text-center text-gray-600 mb-8">
            {t('landing.talentDesc')}
          </p>

          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 bg-[#1B2A6B] text-white px-8 py-3 rounded-lg hover:opacity-90 transition font-medium">
              {t('common.continue')} →
            </span>
          </div>
        </Link>

        {/* Hiring */}
        <Link
          to="/start/hiring"
          className="block bg-white border border-gray-200 rounded-2xl p-10 shadow-xl hover:shadow-2xl transition"
        >
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="w-28 h-28 rounded-full border-4 border-[#C9A24D] flex items-center justify-center">
                <div className="w-14 h-14 bg-gradient-to-b from-[#4F7BFF] to-[#1B2A6B] rotate-45" />
              </div>
              <div className="absolute -bottom-6 -right-6 w-16 h-2 bg-black rotate-45 rounded" />
            </div>
          </div>

          <h2 className="font-sans text-2xl font-semibold text-center mb-3">
            {t('landing.hiring')}
          </h2>

          <p className="text-center text-gray-600 mb-8">
            {t('landing.hiringDesc')}
          </p>

          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 bg-[#1B2A6B] text-white px-8 py-3 rounded-lg hover:opacity-90 transition font-medium">
              {t('common.continue')} →
            </span>
          </div>
        </Link>
      </div>

      {/* Bottom */}
      <div className="relative z-10 text-center mt-16 text-gray-500 pb-10 px-6">
        {t('landing.haveAccount')}{' '}
        <Link to="/login" className="text-[#1B2A6B] underline cursor-pointer hover:text-[#0B1220]">
          {t('landing.signInDashboard')}
        </Link>
      </div>

      <footer className="relative z-10 py-6 text-center text-xs text-gray-500">
        <div className="space-x-3">
          <Link to="/privacy" className="hover:text-[#0B1220]">{t('footer.privacy')}</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-[#0B1220]">{t('footer.terms')}</Link>
          <span>·</span>
          <span>© 2026 DNJ</span>
        </div>
      </footer>
    </div>
  )
}
