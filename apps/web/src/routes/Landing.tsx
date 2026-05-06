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
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-gradient-to-b from-brand-50 via-white to-ink-50">
      <BackgroundDecor />

      <header className="relative z-10 px-6 md:px-10 py-5 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-3" aria-label="DNJ home">
          <Logo />
          <div className="leading-none">
            <div className="font-display font-semibold text-2xl tracking-tight text-brand-950">DNJ</div>
            <div className="text-[10px] font-medium tracking-[0.18em] text-ink-500 mt-0.5">DIAMOND &amp; JEWELER</div>
          </div>
        </Link>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur border border-ink-200 text-ink-700 text-xs font-medium shadow-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
          {t('landing.pilot')}
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-10 md:py-14">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-12 md:mb-16">
            <div className="text-xs md:text-sm font-semibold tracking-[0.22em] uppercase text-accent-600 mb-4">
              {t('landing.eyebrow')}
            </div>
            <h1 className="font-display text-display-sm md:text-display-lg text-brand-950 mb-5">
              {t('landing.titleLead')}{' '}
              <span className="text-accent-500">{t('landing.titleHighlight')}</span>
              <br className="hidden md:block" />
              {' '}{t('landing.titleTrail')}
            </h1>
            <p className="text-ink-500 text-base md:text-lg max-w-2xl mx-auto">
              {t('landing.subtitle')}
            </p>
          </div>

          <div className="relative grid md:grid-cols-2 gap-6 md:gap-10 max-w-4xl mx-auto">
            <DecisionCard
              to="/start/talent"
              title={t('landing.talent')}
              description={t('landing.talentDesc')}
              illustration={<DiamondIllustration />}
              cta={t('common.continue')}
            />

            <OrDivider />

            <DecisionCard
              to="/start/hiring"
              title={t('landing.hiring')}
              description={t('landing.hiringDesc')}
              illustration={<MagnifierIllustration />}
              cta={t('common.continue')}
            />
          </div>

          <div className="mt-12 md:mt-14 flex items-center justify-center gap-3 text-sm">
            <ShieldIcon />
            <span className="text-ink-500">{t('landing.haveAccount')}</span>
            <Link
              to="/login"
              className="font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
            >
              {t('landing.signInDashboard')}
              <Arrow />
            </Link>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-6 text-center text-xs text-ink-500">
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

function DecisionCard({
  to, title, description, illustration, cta,
}: {
  to: string
  title: string
  description: string
  illustration: React.ReactNode
  cta: string
}) {
  return (
    <Link
      to={to}
      className="group relative block rounded-[28px] p-8 md:p-10 text-center transition-all duration-300
                 bg-gradient-to-b from-white/80 to-white/50 backdrop-blur-sm
                 border border-white shadow-card hover:shadow-float
                 hover:-translate-y-0.5
                 ring-1 ring-ink-100"
      style={{
        clipPath: 'polygon(24px 0, calc(100% - 24px) 0, 100% 24px, 100% calc(100% - 24px), calc(100% - 24px) 100%, 24px 100%, 0 calc(100% - 24px), 0 24px)',
      }}
    >
      {/* Corner accents */}
      <span className="pointer-events-none absolute top-0 left-0 w-6 h-6 border-t border-l border-brand-300/60" />
      <span className="pointer-events-none absolute top-0 right-0 w-6 h-6 border-t border-r border-brand-300/60" />
      <span className="pointer-events-none absolute bottom-0 left-0 w-6 h-6 border-b border-l border-brand-300/60" />
      <span className="pointer-events-none absolute bottom-0 right-0 w-6 h-6 border-b border-r border-brand-300/60" />

      <div className="relative h-32 md:h-40 mb-6 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
        {illustration}
      </div>

      <h2 className="font-display text-2xl md:text-3xl text-brand-950 mb-2.5">
        {title}
      </h2>
      <p className="text-sm text-ink-500 max-w-xs mx-auto mb-7 leading-relaxed">
        {description}
      </p>

      <div className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-brand-950 text-white text-sm font-semibold
                      shadow-[0_4px_14px_rgba(39,48,110,0.35)]
                      group-hover:bg-brand-900 group-hover:shadow-[0_6px_18px_rgba(39,48,110,0.45)]
                      transition-all">
        {cta}
        <Arrow />
      </div>

      {/* Bottom glow */}
      <div className="pointer-events-none absolute -bottom-3 left-1/2 -translate-x-1/2 h-3 w-32 rounded-full
                      bg-gradient-to-r from-transparent via-brand-400/40 to-transparent blur-xl
                      opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </Link>
  )
}

function OrDivider() {
  return (
    <div className="absolute inset-0 hidden md:flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-2">
        <div className="h-12 w-px bg-gradient-to-b from-transparent to-ink-200" />
        <span className="text-[11px] font-medium tracking-[0.18em] text-ink-400 uppercase">or</span>
        <div className="h-12 w-px bg-gradient-to-b from-ink-200 to-transparent" />
      </div>
    </div>
  )
}

function BackgroundDecor() {
  return (
    <>
      {/* Soft radial highlights */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[480px] w-[480px] rounded-full bg-accent-500/10 blur-3xl" />

      {/* Faint circuit / tech grid */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.06] text-brand-900"
      >
        <defs>
          <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M 56 0 L 0 0 0 56" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Side diamond watermarks */}
      <svg aria-hidden className="pointer-events-none absolute left-0 top-1/3 -translate-x-1/3 w-72 h-72 opacity-[0.08]">
        <polygon points="20,80 144,20 268,80 144,260" fill="none" stroke="#27306e" strokeWidth="1" />
        <polygon points="56,80 144,46 232,80 144,200" fill="none" stroke="#27306e" strokeWidth="1" />
      </svg>
    </>
  )
}

function Logo() {
  return (
    <svg width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden>
      <defs>
        <linearGradient id="logo-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5468ef" />
          <stop offset="1" stopColor="#27306e" />
        </linearGradient>
        <linearGradient id="logo-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a6b6ff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#5468ef" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <polygon points="8,15 20,4 32,15 20,36" fill="url(#logo-fill)" stroke="#27306e" strokeWidth="1" strokeLinejoin="round" />
      <polygon points="8,15 32,15 20,36" fill="url(#logo-shine)" opacity="0.45" />
      <line x1="8" y1="15" x2="32" y2="15" stroke="#f5f7ff" strokeWidth="0.8" opacity="0.7" />
      <line x1="14" y1="9" x2="20" y2="15" stroke="#f5f7ff" strokeWidth="0.6" opacity="0.6" />
      <line x1="26" y1="9" x2="20" y2="15" stroke="#f5f7ff" strokeWidth="0.6" opacity="0.6" />
      <line x1="14" y1="15" x2="20" y2="36" stroke="#f5f7ff" strokeWidth="0.5" opacity="0.4" />
      <line x1="26" y1="15" x2="20" y2="36" stroke="#f5f7ff" strokeWidth="0.5" opacity="0.4" />
    </svg>
  )
}

function DiamondIllustration() {
  return (
    <svg width="160" height="150" viewBox="0 0 160 150" fill="none" aria-hidden>
      <defs>
        <radialGradient id="halo-talent" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0" stopColor="#a6b6ff" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#a6b6ff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#a6b6ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="d-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8edff" />
          <stop offset="1" stopColor="#7b8efc" />
        </linearGradient>
        <linearGradient id="d-pavilion" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5468ef" />
          <stop offset="1" stopColor="#27306e" />
        </linearGradient>
        <linearGradient id="d-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <ellipse cx="80" cy="78" rx="70" ry="60" fill="url(#halo-talent)" />

      {/* Light rays */}
      <g stroke="#a6b6ff" strokeWidth="1" opacity="0.5">
        <line x1="80" y1="6" x2="80" y2="20" />
        <line x1="22" y1="78" x2="36" y2="78" />
        <line x1="138" y1="78" x2="124" y2="78" />
        <line x1="34" y1="32" x2="44" y2="42" />
        <line x1="126" y1="32" x2="116" y2="42" />
      </g>
      <g fill="#ffffff">
        <circle cx="36" cy="48" r="1.4" opacity="0.9" />
        <circle cx="128" cy="50" r="1.2" opacity="0.8" />
        <circle cx="50" cy="118" r="1.4" opacity="0.7" />
        <circle cx="118" cy="120" r="1" opacity="0.7" />
        <circle cx="80" cy="20" r="1.5" opacity="0.95" />
      </g>

      {/* Diamond */}
      <polygon points="42,62 80,30 118,62" fill="url(#d-crown)" stroke="#27306e" strokeWidth="1.2" strokeLinejoin="round" />
      <polygon points="42,62 118,62 80,132" fill="url(#d-pavilion)" stroke="#27306e" strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="42" y1="62" x2="118" y2="62" stroke="#1a2260" strokeWidth="1.1" />

      {/* Crown facets */}
      <line x1="60" y1="30" x2="60" y2="62" stroke="#27306e" strokeWidth="0.8" opacity="0.55" />
      <line x1="80" y1="30" x2="80" y2="62" stroke="#27306e" strokeWidth="0.8" opacity="0.55" />
      <line x1="100" y1="30" x2="100" y2="62" stroke="#27306e" strokeWidth="0.8" opacity="0.55" />

      {/* Pavilion facets */}
      <line x1="60" y1="62" x2="80" y2="132" stroke="#1a2260" strokeWidth="0.8" opacity="0.5" />
      <line x1="80" y1="62" x2="80" y2="132" stroke="#1a2260" strokeWidth="0.8" opacity="0.5" />
      <line x1="100" y1="62" x2="80" y2="132" stroke="#1a2260" strokeWidth="0.8" opacity="0.5" />

      {/* Shine */}
      <polygon points="48,60 60,34 76,34" fill="url(#d-shine)" opacity="0.7" />

      {/* Sparkles around */}
      <g fill="#ffffff">
        <path d="M28 70 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 z" opacity="0.85" />
        <path d="M134 92 l1 3 l3 1 l-3 1 l-1 3 l-1 -3 l-3 -1 l3 -1 z" opacity="0.7" />
      </g>
    </svg>
  )
}

function MagnifierIllustration() {
  return (
    <svg width="160" height="150" viewBox="0 0 160 150" fill="none" aria-hidden>
      <defs>
        <radialGradient id="halo-hire" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0" stopColor="#c79a3b" stopOpacity="0.18" />
          <stop offset="1" stopColor="#c79a3b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lens-glass" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#f5f7ff" />
          <stop offset="1" stopColor="#dedfda" />
        </radialGradient>
        <linearGradient id="ring-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9c97a" />
          <stop offset="0.5" stopColor="#c79a3b" />
          <stop offset="1" stopColor="#a67c27" />
        </linearGradient>
        <linearGradient id="lens-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="m-d-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8edff" />
          <stop offset="1" stopColor="#7b8efc" />
        </linearGradient>
        <linearGradient id="m-d-pavilion" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5468ef" />
          <stop offset="1" stopColor="#27306e" />
        </linearGradient>
      </defs>

      <ellipse cx="70" cy="64" rx="62" ry="52" fill="url(#halo-hire)" />

      {/* Lens glass */}
      <circle cx="64" cy="64" r="42" fill="url(#lens-glass)" />
      {/* Inner soft shadow */}
      <circle cx="64" cy="64" r="42" fill="none" stroke="#dedfda" strokeWidth="1" opacity="0.6" />
      {/* Gold ring */}
      <circle cx="64" cy="64" r="42" fill="none" stroke="url(#ring-gold)" strokeWidth="6" />
      <circle cx="64" cy="64" r="46" fill="none" stroke="#a67c27" strokeWidth="0.8" opacity="0.5" />

      {/* Tiny diamond inside */}
      <g transform="translate(64 64)">
        <polygon points="-18,-6 0,-22 18,-6" fill="url(#m-d-crown)" stroke="#27306e" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="-18,-6 18,-6 0,26" fill="url(#m-d-pavilion)" stroke="#27306e" strokeWidth="1" strokeLinejoin="round" />
        <line x1="-18" y1="-6" x2="18" y2="-6" stroke="#1a2260" strokeWidth="0.8" />
        <line x1="-9" y1="-22" x2="-9" y2="-6" stroke="#27306e" strokeWidth="0.6" opacity="0.55" />
        <line x1="0" y1="-22" x2="0" y2="-6" stroke="#27306e" strokeWidth="0.6" opacity="0.55" />
        <line x1="9" y1="-22" x2="9" y2="-6" stroke="#27306e" strokeWidth="0.6" opacity="0.55" />
      </g>

      {/* Lens highlight */}
      <ellipse cx="48" cy="46" rx="12" ry="6" fill="url(#lens-shine)" opacity="0.85" transform="rotate(-30 48 46)" />

      {/* Handle */}
      <line x1="98" y1="98" x2="138" y2="138" stroke="#22231f" strokeWidth="9" strokeLinecap="round" />
      <line x1="100" y1="100" x2="120" y2="120" stroke="#464840" strokeWidth="9" strokeLinecap="round" opacity="0.7" />
      <circle cx="138" cy="138" r="5" fill="#22231f" />

      {/* Sparkles */}
      <g fill="#c79a3b">
        <circle cx="118" cy="36" r="1.6" opacity="0.85" />
        <circle cx="22" cy="100" r="1.4" opacity="0.7" />
      </g>
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 2.5l6 2v4.5c0 4-2.7 7.4-6 8-3.3-.6-6-4-6-8V4.5l6-2z"
        fill="#e8edff"
        stroke="#5468ef"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M7.5 10.2l1.7 1.7 3.3-3.3" stroke="#27306e" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 7h10m0 0L8 3m4 4L8 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
