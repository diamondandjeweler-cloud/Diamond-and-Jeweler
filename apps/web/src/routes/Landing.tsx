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
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-white">
      <BackgroundDecor />

      <header className="relative z-10 px-6 md:px-12 py-6 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-3" aria-label="DNJ home">
          <BrandLogo />
          <div className="leading-none">
            <div className="font-sans font-extrabold text-[28px] tracking-[-0.01em] text-brand-950">DNJ</div>
            <div className="text-[10px] font-medium tracking-[0.22em] text-ink-500 mt-1">DIAMOND &amp; JEWELER</div>
          </div>
        </Link>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-ink-200 text-ink-700 text-xs font-medium shadow-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
          {t('landing.pilot')}
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-8 md:py-12">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-12 md:mb-14">
            <div className="text-[11px] md:text-xs font-semibold tracking-[0.28em] uppercase text-accent-600 mb-5">
              {t('landing.eyebrow')}
            </div>
            <h1 className="font-sans font-bold text-4xl md:text-6xl leading-[1.05] tracking-[-0.02em] text-brand-950 mb-6">
              {t('landing.titleLead')}{' '}
              <span className="text-accent-500">{t('landing.titleHighlight')}</span>
              <br />
              {t('landing.titleTrail')}
            </h1>
            <div className="flex items-center justify-center gap-3 mb-2">
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-brand-300" />
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              <span className="h-px w-10 bg-gradient-to-l from-transparent to-brand-300" />
            </div>
            <p className="text-ink-500 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              {t('landing.subtitle').split('. ').map((s, i, arr) => (
                <span key={i} className="block">
                  {s}{i < arr.length - 1 ? '.' : ''}
                </span>
              ))}
            </p>
          </div>

          <div className="relative grid md:grid-cols-2 gap-6 md:gap-12 max-w-4xl mx-auto">
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
              className="font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1.5"
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
      className="group relative block rounded-[36px] px-8 md:px-10 pt-10 pb-9 text-center transition-all duration-300
                 bg-white
                 ring-1 ring-ink-100
                 shadow-[0_2px_4px_rgba(20,21,17,0.04),0_12px_30px_-12px_rgba(20,21,17,0.08)]
                 hover:shadow-[0_4px_8px_rgba(20,21,17,0.05),0_20px_40px_-12px_rgba(39,48,110,0.18)]
                 hover:-translate-y-0.5"
      style={{
        clipPath:
          'polygon(28px 0, calc(100% - 28px) 0, 100% 28px, 100% calc(100% - 28px), calc(100% - 28px) 100%, 28px 100%, 0 calc(100% - 28px), 0 28px)',
      }}
    >
      {/* Subtle inner border to draw the chamfered edge */}
      <span
        className="pointer-events-none absolute inset-[3px] opacity-50"
        style={{
          clipPath:
            'polygon(26px 0, calc(100% - 26px) 0, 100% 26px, 100% calc(100% - 26px), calc(100% - 26px) 100%, 26px 100%, 0 calc(100% - 26px), 0 26px)',
          background:
            'linear-gradient(135deg, transparent 0%, transparent 35%, rgba(166,182,255,0.18) 50%, transparent 65%, transparent 100%)',
        }}
      />

      <div className="relative h-44 md:h-48 mb-6 flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.03]">
        {illustration}
      </div>

      <div className="relative">
        <h2 className="font-sans font-bold text-2xl md:text-[28px] tracking-[-0.01em] text-brand-950 mb-3">
          {title}
        </h2>
        <div className="mx-auto mb-4 h-px w-16 bg-gradient-to-r from-transparent via-accent-500 to-transparent opacity-70" />
        <p className="text-sm text-ink-500 max-w-xs mx-auto mb-7 leading-relaxed">
          {description.split('. ').map((s, i, arr) => (
            <span key={i} className="block">
              {s}{i < arr.length - 1 ? '.' : ''}
            </span>
          ))}
        </p>

        <div
          className="inline-flex items-center justify-center gap-2 px-9 py-3.5 rounded-2xl bg-brand-950 text-white text-[15px] font-semibold
                        shadow-[0_4px_14px_rgba(39,48,110,0.35)]
                        group-hover:bg-brand-900 group-hover:shadow-[0_8px_22px_rgba(39,48,110,0.45)]
                        transition-all"
        >
          {cta}
          <Arrow />
        </div>
      </div>

      {/* Bottom glow */}
      <div
        className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 h-3 w-40 rounded-full
                      bg-gradient-to-r from-transparent via-brand-400/50 to-transparent blur-xl
                      opacity-0 group-hover:opacity-100 transition-opacity duration-500"
      />
    </Link>
  )
}

function OrDivider() {
  return (
    <div className="absolute inset-0 hidden md:flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-3">
        <div className="h-16 w-px bg-gradient-to-b from-transparent to-ink-200" />
        <span className="text-[11px] font-medium tracking-[0.2em] text-ink-400 uppercase">or</span>
        <div className="h-16 w-px bg-gradient-to-b from-ink-200 to-transparent" />
      </div>
    </div>
  )
}

function BackgroundDecor() {
  return (
    <>
      {/* Soft brand wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50/40 via-white to-white" />

      {/* Left circuit/blueprint trace */}
      <svg
        aria-hidden
        className="pointer-events-none absolute -left-20 top-20 w-[520px] h-[640px] text-brand-300 opacity-40"
        viewBox="0 0 520 640"
        fill="none"
      >
        <g stroke="currentColor" strokeWidth="0.6">
          {/* Faceted diamond outline */}
          <polygon points="100,260 220,140 340,260 220,520" fill="none" />
          <polygon points="160,260 220,200 280,260 220,440" fill="none" />
          <line x1="100" y1="260" x2="340" y2="260" />
          <line x1="160" y1="260" x2="220" y2="140" />
          <line x1="280" y1="260" x2="220" y2="140" />
          <line x1="160" y1="260" x2="220" y2="520" />
          <line x1="280" y1="260" x2="220" y2="520" />

          {/* Circuit traces */}
          <path d="M 0 320 L 80 320 L 100 300 L 140 300" />
          <path d="M 0 380 L 60 380 L 80 360 L 120 360" />
          <path d="M 360 280 L 420 280 L 440 260 L 520 260" />
          <path d="M 360 340 L 460 340 L 480 320 L 520 320" />
        </g>
        <g fill="currentColor">
          <circle cx="80" cy="320" r="2" />
          <circle cx="140" cy="300" r="2" />
          <circle cx="60" cy="380" r="2" />
          <circle cx="120" cy="360" r="2" />
          <circle cx="420" cy="280" r="2" />
          <circle cx="460" cy="340" r="2" />
        </g>
      </svg>

      {/* Right circuit/blueprint trace */}
      <svg
        aria-hidden
        className="pointer-events-none absolute -right-24 top-32 w-[480px] h-[600px] text-brand-300 opacity-35"
        viewBox="0 0 480 600"
        fill="none"
      >
        <g stroke="currentColor" strokeWidth="0.6">
          <circle cx="320" cy="280" r="180" fill="none" opacity="0.5" />
          <circle cx="320" cy="280" r="120" fill="none" opacity="0.4" />
          <circle cx="320" cy="280" r="60" fill="none" opacity="0.3" />
          <path d="M 480 240 L 420 240 L 400 220 L 360 220" />
          <path d="M 480 320 L 440 320 L 420 340 L 380 340" />
          <path d="M 100 200 L 140 200 L 160 180 L 200 180" />
          <path d="M 60 380 L 120 380 L 140 400 L 200 400" />
        </g>
        <g fill="currentColor">
          <circle cx="420" cy="240" r="2" />
          <circle cx="440" cy="320" r="2" />
          <circle cx="140" cy="200" r="2" />
          <circle cx="120" cy="380" r="2" />
        </g>
      </svg>

      {/* Tiny dots scattered */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 w-full h-full opacity-50">
        <g fill="#a6b6ff">
          <circle cx="12%" cy="28%" r="1.2" />
          <circle cx="86%" cy="22%" r="1" />
          <circle cx="92%" cy="68%" r="1.2" />
          <circle cx="8%" cy="76%" r="1" />
          <circle cx="78%" cy="86%" r="1" />
          <circle cx="22%" cy="92%" r="1" />
        </g>
      </svg>
    </>
  )
}

function BrandLogo() {
  // Front-view brilliant-cut diamond brand mark (kite silhouette)
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden>
      <defs>
        <linearGradient id="bl-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a6b6ff" />
          <stop offset="1" stopColor="#5468ef" />
        </linearGradient>
        <linearGradient id="bl-pavilion" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3e4fd3" />
          <stop offset="1" stopColor="#181d44" />
        </linearGradient>
      </defs>
      {/* Crown */}
      <polygon points="6,18 24,6 42,18" fill="url(#bl-crown)" stroke="#181d44" strokeWidth="0.9" strokeLinejoin="round" />
      {/* Pavilion */}
      <polygon points="6,18 42,18 24,44" fill="url(#bl-pavilion)" stroke="#181d44" strokeWidth="0.9" strokeLinejoin="round" />
      {/* Girdle line */}
      <line x1="6" y1="18" x2="42" y2="18" stroke="#181d44" strokeWidth="0.8" />
      {/* Crown facets */}
      <line x1="14" y1="6" x2="14" y2="18" stroke="#181d44" strokeWidth="0.5" opacity="0.55" />
      <line x1="24" y1="6" x2="24" y2="18" stroke="#181d44" strokeWidth="0.5" opacity="0.55" />
      <line x1="34" y1="6" x2="34" y2="18" stroke="#181d44" strokeWidth="0.5" opacity="0.55" />
      {/* Pavilion facets */}
      <line x1="14" y1="18" x2="24" y2="44" stroke="#f5f7ff" strokeWidth="0.5" opacity="0.45" />
      <line x1="34" y1="18" x2="24" y2="44" stroke="#f5f7ff" strokeWidth="0.5" opacity="0.45" />
      <line x1="24" y1="18" x2="24" y2="44" stroke="#f5f7ff" strokeWidth="0.5" opacity="0.45" />
      {/* Highlight */}
      <polygon points="10,17 24,8 22,17" fill="#ffffff" opacity="0.55" />
    </svg>
  )
}

function DiamondIllustration() {
  // Front-view brilliant-cut diamond on a luminous halo
  return (
    <svg width="200" height="180" viewBox="0 0 200 180" fill="none" aria-hidden>
      <defs>
        <radialGradient id="halo-outer" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0" stopColor="#cdd6ff" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#a6b6ff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#a6b6ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="halo-inner" cx="0.5" cy="0.45" r="0.35">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.6" stopColor="#dbe4ff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dia-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#cdd6ff" />
          <stop offset="1" stopColor="#7b8efc" />
        </linearGradient>
        <linearGradient id="dia-pav" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5468ef" />
          <stop offset="0.6" stopColor="#3e4fd3" />
          <stop offset="1" stopColor="#181d44" />
        </linearGradient>
        <linearGradient id="dia-table-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Halo */}
      <ellipse cx="100" cy="92" rx="92" ry="78" fill="url(#halo-outer)" />
      <ellipse cx="100" cy="84" rx="58" ry="48" fill="url(#halo-inner)" />

      {/* Light rays */}
      <g stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <line x1="100" y1="12" x2="100" y2="30" />
        <line x1="100" y1="160" x2="100" y2="178" />
        <line x1="14" y1="92" x2="34" y2="92" />
        <line x1="166" y1="92" x2="186" y2="92" />
      </g>
      <g stroke="#cdd6ff" strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <line x1="42" y1="34" x2="54" y2="46" />
        <line x1="158" y1="34" x2="146" y2="46" />
        <line x1="42" y1="150" x2="54" y2="138" />
        <line x1="158" y1="150" x2="146" y2="138" />
      </g>

      {/* Diamond front view */}
      <g transform="translate(100 92)">
        {/* Crown */}
        <polygon
          points="-50,-22 -34,-44 34,-44 50,-22"
          fill="url(#dia-crown)"
          stroke="#1a2260"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        {/* Pavilion */}
        <polygon
          points="-50,-22 50,-22 0,52"
          fill="url(#dia-pav)"
          stroke="#1a2260"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        {/* Girdle line */}
        <line x1="-50" y1="-22" x2="50" y2="-22" stroke="#181d44" strokeWidth="1.2" />
        <line x1="-50" y1="-22" x2="50" y2="-22" stroke="#ffffff" strokeWidth="0.4" opacity="0.5" />

        {/* Crown vertical facets */}
        <line x1="-22" y1="-44" x2="-22" y2="-22" stroke="#1a2260" strokeWidth="0.7" opacity="0.55" />
        <line x1="0" y1="-44" x2="0" y2="-22" stroke="#1a2260" strokeWidth="0.7" opacity="0.55" />
        <line x1="22" y1="-44" x2="22" y2="-22" stroke="#1a2260" strokeWidth="0.7" opacity="0.55" />
        {/* Crown bezel diagonals */}
        <line x1="-50" y1="-22" x2="-22" y2="-44" stroke="#1a2260" strokeWidth="0.5" opacity="0.4" />
        <line x1="50" y1="-22" x2="22" y2="-44" stroke="#1a2260" strokeWidth="0.5" opacity="0.4" />

        {/* Pavilion main facets meeting at culet */}
        <line x1="-34" y1="-22" x2="0" y2="52" stroke="#cdd6ff" strokeWidth="0.7" opacity="0.55" />
        <line x1="-18" y1="-22" x2="0" y2="52" stroke="#cdd6ff" strokeWidth="0.7" opacity="0.55" />
        <line x1="0" y1="-22" x2="0" y2="52" stroke="#cdd6ff" strokeWidth="0.7" opacity="0.55" />
        <line x1="18" y1="-22" x2="0" y2="52" stroke="#cdd6ff" strokeWidth="0.7" opacity="0.55" />
        <line x1="34" y1="-22" x2="0" y2="52" stroke="#cdd6ff" strokeWidth="0.7" opacity="0.55" />

        {/* Crown highlight (table reflection) */}
        <polygon points="-30,-42 30,-42 24,-26 -24,-26" fill="url(#dia-table-shine)" opacity="0.7" />
        <polygon points="-46,-22 -34,-44 -22,-26" fill="#ffffff" opacity="0.35" />
      </g>

      {/* Sparkles */}
      <g fill="#ffffff">
        <path d="M30 50 l1.5 3.8 l3.8 1.5 l-3.8 1.5 l-1.5 3.8 l-1.5 -3.8 l-3.8 -1.5 l3.8 -1.5 z" opacity="0.9" />
        <path d="M170 110 l1.1 2.8 l2.8 1.1 l-2.8 1.1 l-1.1 2.8 l-1.1 -2.8 l-2.8 -1.1 l2.8 -1.1 z" opacity="0.85" />
        <path d="M52 158 l0.9 2.2 l2.2 0.9 l-2.2 0.9 l-0.9 2.2 l-0.9 -2.2 l-2.2 -0.9 l2.2 -0.9 z" opacity="0.7" />
      </g>
      <g fill="#c79a3b">
        <circle cx="160" cy="40" r="1.6" opacity="0.85" />
        <circle cx="38" cy="138" r="1.4" opacity="0.7" />
      </g>
    </svg>
  )
}

function MagnifierIllustration() {
  // Realistic gold magnifier with a top-down brilliant-cut diamond inside
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" fill="none" aria-hidden>
      <defs>
        <radialGradient id="m-halo" cx="0.45" cy="0.45" r="0.55">
          <stop offset="0" stopColor="#fff7e2" stopOpacity="0.85" />
          <stop offset="0.6" stopColor="#fce8b3" stopOpacity="0.2" />
          <stop offset="1" stopColor="#fff7e2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="m-glass" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f5f7ff" />
          <stop offset="1" stopColor="#dedfda" />
        </radialGradient>
        <linearGradient id="m-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8e2a0" />
          <stop offset="0.35" stopColor="#e9c97a" />
          <stop offset="0.65" stopColor="#c79a3b" />
          <stop offset="1" stopColor="#7c5a18" />
        </linearGradient>
        <linearGradient id="m-handle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3b35" />
          <stop offset="0.5" stopColor="#22231f" />
          <stop offset="1" stopColor="#0c0d0a" />
        </linearGradient>
        <linearGradient id="m-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Reuse gradients for inner diamond */}
        <linearGradient id="md-table" x1="0.3" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#cdd6ff" />
          <stop offset="1" stopColor="#5468ef" />
        </linearGradient>
        <linearGradient id="md-girdle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7b8efc" />
          <stop offset="1" stopColor="#3e4fd3" />
        </linearGradient>
      </defs>

      {/* Halo behind */}
      <ellipse cx="78" cy="74" rx="72" ry="62" fill="url(#m-halo)" />

      {/* Glass disc */}
      <circle cx="74" cy="74" r="50" fill="url(#m-glass)" />
      {/* Inner shadow */}
      <circle cx="74" cy="74" r="50" fill="none" stroke="#dedfda" strokeWidth="1" opacity="0.7" />

      {/* Gold ring */}
      <circle cx="74" cy="74" r="50" fill="none" stroke="url(#m-ring)" strokeWidth="7" />
      {/* Outer gold accent */}
      <circle cx="74" cy="74" r="54" fill="none" stroke="#a67c27" strokeWidth="0.6" opacity="0.6" />
      <circle cx="74" cy="74" r="46.5" fill="none" stroke="#7c5a18" strokeWidth="0.6" opacity="0.5" />

      {/* Brilliant-cut diamond inside (front view) */}
      <g transform="translate(74 70) scale(0.7)">
        {/* Crown */}
        <polygon
          points="-44,-18 -28,-38 28,-38 44,-18"
          fill="url(#md-table)"
          stroke="#1a2260"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* Pavilion */}
        <polygon
          points="-44,-18 44,-18 0,46"
          fill="url(#md-girdle)"
          stroke="#1a2260"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <line x1="-44" y1="-18" x2="44" y2="-18" stroke="#181d44" strokeWidth="1" />

        {/* Crown facet lines */}
        <line x1="-18" y1="-38" x2="-18" y2="-18" stroke="#1a2260" strokeWidth="0.55" opacity="0.55" />
        <line x1="0" y1="-38" x2="0" y2="-18" stroke="#1a2260" strokeWidth="0.55" opacity="0.55" />
        <line x1="18" y1="-38" x2="18" y2="-18" stroke="#1a2260" strokeWidth="0.55" opacity="0.55" />

        {/* Pavilion facet lines */}
        <line x1="-30" y1="-18" x2="0" y2="46" stroke="#cdd6ff" strokeWidth="0.55" opacity="0.55" />
        <line x1="-15" y1="-18" x2="0" y2="46" stroke="#cdd6ff" strokeWidth="0.55" opacity="0.55" />
        <line x1="0" y1="-18" x2="0" y2="46" stroke="#cdd6ff" strokeWidth="0.55" opacity="0.55" />
        <line x1="15" y1="-18" x2="0" y2="46" stroke="#cdd6ff" strokeWidth="0.55" opacity="0.55" />
        <line x1="30" y1="-18" x2="0" y2="46" stroke="#cdd6ff" strokeWidth="0.55" opacity="0.55" />

        {/* Highlight */}
        <polygon points="-26,-36 26,-36 20,-22 -20,-22" fill="#ffffff" opacity="0.6" />
      </g>

      {/* Glass highlight */}
      <ellipse cx="54" cy="52" rx="14" ry="6" fill="url(#m-shine)" opacity="0.8" transform="rotate(-30 54 52)" />
      <circle cx="108" cy="46" r="3" fill="#ffffff" opacity="0.8" />

      {/* Handle */}
      <g>
        <line x1="110" y1="110" x2="156" y2="156" stroke="url(#m-handle)" strokeWidth="11" strokeLinecap="round" />
        <line x1="114" y1="114" x2="138" y2="138" stroke="#5b5d52" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
        <circle cx="156" cy="156" r="6" fill="url(#m-handle)" />
        <circle cx="156" cy="156" r="2" fill="#0c0d0a" />
      </g>

      {/* Sparkles around */}
      <g fill="#c79a3b">
        <circle cx="130" cy="30" r="1.6" opacity="0.85" />
        <circle cx="22" cy="120" r="1.4" opacity="0.7" />
      </g>
      <g fill="#ffffff">
        <path d="M30 50 l1 2.4 l2.4 1 l-2.4 1 l-1 2.4 l-1 -2.4 l-2.4 -1 l2.4 -1 z" opacity="0.85" />
      </g>
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path
        d="M11 2.5l7 2.2v5.1c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V4.7l7-2.2z"
        fill="#e8edff"
        stroke="#5468ef"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8 11.2l2 2 4-4"
        stroke="#27306e"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
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
