import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../state/useSession'
import { useSeo } from '../lib/useSeo'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Landing() {
  const { t } = useTranslation()
  const { session, profile, loading } = useSession()
  useSeo({
    title: 'AI-Curated Job Vacancy Malaysia — Pilot, Diamond & Jeweler Hiring Now',
    description: 'Precision recruitment powered by AI. DNJ matches the right talent with the right company in Malaysia — three curated matches at a time, zero noise. Pilot, diamond & jeweler, sales, admin, finance, fresh graduate roles in KL, PJ, Penang. PDPA-compliant, end-to-end encrypted. Apply online — walk-in interview, immediate hiring.',
    keywords: 'jobs near me, job vacancy near me, urgent hiring near me, walk in interview, hiring immediately, apply job online, latest job vacancy, part time job near me, full time job, fresh graduate job, no experience job, immediate hiring, hiring now, pilot job vacancy, jeweler job vacancy, diamond expert job vacancy, luxury retail job vacancy, job vacancy in Kuala Lumpur, job vacancy in PJ, job vacancy in Penang, job vacancy in Malaysia, work from home Kuala Lumpur, remote job Malaysia, fresh graduate job vacancy, cadet pilot program, aviation job vacancy, gemologist job, jewellery shop hiring, career opportunity, career growth job, account assistant job vacancy, admin executive job vacancy, software developer job vacancy, sales executive job vacancy, graphic designer job vacancy, marketing executive job vacancy, customer service job vacancy, hr assistant job vacancy, finance job vacancy, operation job vacancy',
  })
  if (!loading && session && profile) return <Navigate to="/home" replace />

  return (
    <div className="relative min-h-screen md:h-screen flex flex-col md:overflow-hidden bg-white text-[#0B1220] font-sans">
      <a
        href="#landing-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-[#0B1220] text-white px-3 py-2 rounded z-50 text-sm"
      >
        Skip to main content
      </a>
      <BackgroundDecor />

      {/* Top Bar */}
      <header className="relative z-10 px-6 md:px-12 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
        <Link to="/" className="flex items-center gap-3" aria-label="DNJ home">
          <BrandMark />
          <div className="leading-none">
            <div className="font-sans font-extrabold text-[26px] tracking-tight text-[#0B1220]">DNJ</div>
            <div className="text-[10px] font-medium tracking-[0.22em] text-gray-500 mt-1">DIAMOND &amp; JEWELER</div>
          </div>
        </Link>

        <div className="inline-flex items-center gap-2 border border-gray-300 px-3.5 py-1.5 rounded-full text-xs text-gray-700 bg-white shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#C9A24D]" />
          {t('landing.pilot')}
        </div>
      </header>

      <main id="landing-main" className="relative z-10 flex-1 flex flex-col items-center justify-start md:justify-center px-6 py-4 md:py-2 md:min-h-0">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto mb-4 md:mb-6">
          <div className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">
            {t('landing.eyebrow').toUpperCase()}
          </div>
          <h1 className="font-sans font-bold text-[34px] md:text-[46px] leading-[1.05] tracking-tight text-[#0B1220] mb-2">
            {t('landing.titleLead')}{' '}
            <span className="text-[#C9A24D]">{t('landing.titleHighlight')}</span>
            <br />
            {t('landing.titleTrail')}
          </h1>
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-[#a6b6ff]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#7b8efc]" />
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-[#a6b6ff]" />
          </div>
          <p className="text-gray-600 text-[14px] md:text-[15px] leading-snug">
            <span className="block">AI matches the right talent with the right company.</span>
            <span className="block">You focus on what matters.</span>
          </p>
        </div>

        {/* Cards */}
        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-12 max-w-4xl w-full">
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

        {/* Sign-in row */}
        <div className="mt-4 md:mt-5 flex items-center justify-center gap-2.5 text-sm">
          <ShieldIcon />
          <span className="text-gray-500">{t('landing.haveAccount')}</span>
          <Link
            to="/login"
            className="font-semibold text-[#1B2A6B] underline underline-offset-4 decoration-[1.5px] hover:text-[#0B1220] inline-flex items-center gap-1"
          >
            {t('landing.signInDashboard')}
            <Arrow />
          </Link>
        </div>
      </main>

      <footer className="relative z-10 pt-1 pb-2 text-center text-[10px] text-gray-500 flex-shrink-0 flex flex-col items-center gap-1">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <Link to="/careers" className="hover:text-[#0B1220]">Careers</Link>
          <span>·</span>
          <Link to="/privacy" className="hover:text-[#0B1220]">{t('footer.privacy')}</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-[#0B1220]">{t('footer.terms')}</Link>
          <span>·</span>
          <span>© 2026 DNJ</span>
          <span>·</span>
          <LanguageSwitcher />
        </div>
        <PopularSearches />
      </footer>
    </div>
  )
}

function PopularSearches() {
  return (
    <details className="text-[10px] text-gray-500 max-w-3xl mx-auto px-4">
      <summary className="cursor-pointer hover:text-gray-700 list-none select-none">
        Popular searches
      </summary>
      <nav
        aria-label="Popular job search terms"
        className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 leading-relaxed"
      >
        <Link to="/careers" className="hover:text-[#0B1220]">Jobs near me</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Job vacancy near me</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Urgent hiring near me</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Walk in interview</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Hiring immediately</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Apply job online</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Latest job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Part time job near me</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Full time job</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Fresh graduate job</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">No experience job</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Immediate hiring</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Hiring now</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Pilot job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Cadet pilot program</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Aviation job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Jeweler job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Diamond expert job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Gemologist job</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Luxury retail job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Sales executive job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Account assistant job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Admin executive job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Software developer job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Graphic designer job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Marketing executive job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Customer service job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">HR assistant job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Finance job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Operation job vacancy</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Job vacancy in Kuala Lumpur</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Job vacancy in PJ</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Job vacancy in Penang</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Job vacancy in Malaysia</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Work from home Kuala Lumpur</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Remote job Malaysia</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Internship</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Graduate trainee program</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">Diploma holder job</Link>
        <Link to="/careers" className="hover:text-[#0B1220]">SPM leaver job</Link>
        <Link to="/careers/urgent-hiring-malaysia-2026" className="hover:text-[#0B1220]">Urgent hiring near me 2026</Link>
      </nav>
    </details>
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
      className="group relative block px-6 md:px-8 pt-5 pb-6 text-center transition-all duration-300
                 bg-gradient-to-b from-white to-[#fafbff]
                 ring-1 ring-[#e8edff]
                 shadow-[0_2px_4px_rgba(20,21,17,0.04),0_14px_36px_-14px_rgba(39,48,110,0.12)]
                 hover:shadow-[0_4px_8px_rgba(20,21,17,0.05),0_24px_48px_-12px_rgba(39,48,110,0.22)]
                 hover:-translate-y-0.5"
      style={{
        clipPath:
          'polygon(26px 0, calc(100% - 26px) 0, 100% 26px, 100% calc(100% - 26px), calc(100% - 26px) 100%, 26px 100%, 0 calc(100% - 26px), 0 26px)',
      }}
    >
      <div className="relative h-28 md:h-32 mb-2 flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.04]">
        {illustration}
      </div>

      <h2 className="font-sans font-bold text-xl md:text-2xl tracking-tight text-[#0B1220] mb-2">
        {title}
      </h2>
      <div className="mx-auto mb-3 h-px w-14 bg-gradient-to-r from-transparent via-[#C9A24D] to-transparent opacity-70" />
      <p className="text-[13px] text-gray-600 max-w-xs mx-auto mb-4 leading-snug">
        {description.split('. ').map((s, i, arr) => (
          <span key={i} className="block">
            {s}{i < arr.length - 1 ? '.' : ''}
          </span>
        ))}
      </p>

      <div
        className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-xl bg-[#0B1742] text-white text-sm font-semibold
                      shadow-[0_4px_14px_rgba(11,23,66,0.4)]
                      group-hover:bg-[#1B2A6B] group-hover:shadow-[0_8px_22px_rgba(11,23,66,0.5)]
                      transition-all"
      >
        {cta}
        <Arrow />
      </div>

      {/* Bottom glow */}
      <div className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 h-3 w-32 rounded-full bg-gradient-to-r from-transparent via-[#7b8efc]/40 to-transparent blur-xl opacity-70" />
    </Link>
  )
}

function OrDivider() {
  return (
    <div className="absolute inset-0 hidden md:flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-2">
        <div className="h-12 w-px bg-gradient-to-b from-transparent to-gray-300" />
        <span className="text-[10px] font-medium tracking-[0.2em] text-gray-400 uppercase">or</span>
        <div className="h-12 w-px bg-gradient-to-b from-gray-300 to-transparent" />
      </div>
    </div>
  )
}

function BackgroundDecor() {
  return (
    <>
      {/* Subtle warm wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#f5f7ff]/40 via-white to-[#fffaf1]/30" />

      {/* Left: large diamond outline */}
      <svg
        aria-hidden
        viewBox="0 0 600 800"
        className="pointer-events-none absolute -left-32 top-16 w-[560px] h-[720px] text-[#a6b6ff] opacity-[0.35]"
        fill="none"
      >
        <g stroke="currentColor" strokeWidth="0.7">
          <polygon points="120,300 280,140 440,300 280,640" />
          <polygon points="180,300 280,200 380,300 280,540" />
          <line x1="120" y1="300" x2="440" y2="300" />
          <line x1="180" y1="300" x2="280" y2="140" />
          <line x1="380" y1="300" x2="280" y2="140" />
          <line x1="180" y1="300" x2="280" y2="640" />
          <line x1="380" y1="300" x2="280" y2="640" />
          {/* Circuit traces */}
          <path d="M 0 360 L 80 360 L 100 340 L 160 340" />
          <path d="M 0 420 L 60 420 L 80 400 L 120 400" />
          <path d="M 0 500 L 100 500 L 120 480 L 180 480" />
          <path d="M 460 320 L 520 320 L 540 300 L 600 300" />
        </g>
        <g fill="currentColor">
          <circle cx="80" cy="360" r="2" />
          <circle cx="160" cy="340" r="2" />
          <circle cx="60" cy="420" r="2" />
          <circle cx="100" cy="500" r="2" />
          <circle cx="520" cy="320" r="2" />
        </g>
      </svg>

      {/* Right: circular tech pattern */}
      <svg
        aria-hidden
        viewBox="0 0 600 800"
        className="pointer-events-none absolute -right-32 top-12 w-[520px] h-[700px] text-[#a6b6ff] opacity-[0.32]"
        fill="none"
      >
        <g stroke="currentColor" strokeWidth="0.7">
          <circle cx="380" cy="340" r="220" opacity="0.55" />
          <circle cx="380" cy="340" r="160" opacity="0.45" />
          <circle cx="380" cy="340" r="100" opacity="0.35" />
          <circle cx="380" cy="340" r="48" opacity="0.3" />
          <line x1="160" y1="340" x2="600" y2="340" opacity="0.3" />
          <line x1="380" y1="120" x2="380" y2="560" opacity="0.3" />
          <path d="M 600 280 L 540 280 L 520 260 L 480 260" />
          <path d="M 600 380 L 560 380 L 540 400 L 500 400" />
          <path d="M 100 200 L 160 200 L 180 180 L 240 180" />
          <path d="M 60 480 L 140 480 L 160 500 L 220 500" />
        </g>
        <g fill="currentColor">
          <circle cx="540" cy="280" r="2" />
          <circle cx="560" cy="380" r="2" />
          <circle cx="160" cy="200" r="2" />
          <circle cx="140" cy="480" r="2" />
        </g>
      </svg>

      {/* Scattered sparkle dots */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 w-full h-full opacity-60">
        <g fill="#a6b6ff">
          <circle cx="14%" cy="22%" r="1.4" />
          <circle cx="86%" cy="18%" r="1.2" />
          <circle cx="92%" cy="64%" r="1.4" />
          <circle cx="8%" cy="74%" r="1.2" />
          <circle cx="78%" cy="86%" r="1.2" />
          <circle cx="22%" cy="92%" r="1.2" />
          <circle cx="48%" cy="6%" r="1" />
          <circle cx="58%" cy="94%" r="1" />
        </g>
      </svg>
    </>
  )
}

function BrandMark() {
  // Front-view brilliant-cut diamond brand mark, navy on white
  return (
    <svg width="40" height="40" viewBox="0 0 44 44" fill="none" aria-hidden>
      <defs>
        <linearGradient id="bm-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a6b6ff" />
          <stop offset="1" stopColor="#5468ef" />
        </linearGradient>
        <linearGradient id="bm-pav" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3e4fd3" />
          <stop offset="1" stopColor="#0b1742" />
        </linearGradient>
      </defs>
      <polygon points="6,16 22,4 38,16" fill="url(#bm-crown)" stroke="#0b1742" strokeWidth="0.9" strokeLinejoin="round" />
      <polygon points="6,16 38,16 22,40" fill="url(#bm-pav)" stroke="#0b1742" strokeWidth="0.9" strokeLinejoin="round" />
      <line x1="6" y1="16" x2="38" y2="16" stroke="#0b1742" strokeWidth="0.7" />
      <line x1="14" y1="4" x2="14" y2="16" stroke="#0b1742" strokeWidth="0.5" opacity="0.55" />
      <line x1="22" y1="4" x2="22" y2="16" stroke="#0b1742" strokeWidth="0.5" opacity="0.55" />
      <line x1="30" y1="4" x2="30" y2="16" stroke="#0b1742" strokeWidth="0.5" opacity="0.55" />
      <line x1="14" y1="16" x2="22" y2="40" stroke="#a6b6ff" strokeWidth="0.5" opacity="0.5" />
      <line x1="30" y1="16" x2="22" y2="40" stroke="#a6b6ff" strokeWidth="0.5" opacity="0.5" />
      <line x1="22" y1="16" x2="22" y2="40" stroke="#a6b6ff" strokeWidth="0.5" opacity="0.5" />
      <polygon points="9,15 22,5 19,15" fill="#ffffff" opacity="0.55" />
    </svg>
  )
}

function DiamondIllustration() {
  // Front-view brilliant cut with luminous halo, glow filter, sparkles
  return (
    <svg
      width="160"
      height="148"
      viewBox="0 0 200 200"
      fill="none"
      role="img"
      aria-label="Diamond and jeweler career opportunity in Malaysia — fresh graduate friendly luxury retail job vacancy"
    >
      <defs>
        <radialGradient id="d-halo-1" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0" stopColor="#cdd6ff" stopOpacity="0.85" />
          <stop offset="0.4" stopColor="#a6b6ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#a6b6ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="d-halo-2" cx="0.5" cy="0.45" r="0.32">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="0.55" stopColor="#dbe4ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="d-table" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#dbe4ff" />
          <stop offset="1" stopColor="#7b8efc" />
        </linearGradient>
        <linearGradient id="d-table-bright" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="1" stopColor="#cdd6ff" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="d-pav-l" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b8efc" />
          <stop offset="1" stopColor="#1a2260" />
        </linearGradient>
        <linearGradient id="d-pav-c" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5468ef" />
          <stop offset="1" stopColor="#0b1742" />
        </linearGradient>
        <linearGradient id="d-pav-r" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3e4fd3" />
          <stop offset="1" stopColor="#0b1742" />
        </linearGradient>
        <filter id="d-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer halo */}
      <ellipse cx="100" cy="104" rx="92" ry="80" fill="url(#d-halo-1)" />
      {/* Inner bright halo */}
      <ellipse cx="100" cy="92" rx="58" ry="48" fill="url(#d-halo-2)" />

      {/* Light rays */}
      <g stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" filter="url(#d-glow)">
        <line x1="100" y1="14" x2="100" y2="36" opacity="0.95" />
        <line x1="100" y1="172" x2="100" y2="194" opacity="0.6" />
        <line x1="14" y1="104" x2="38" y2="104" opacity="0.85" />
        <line x1="162" y1="104" x2="186" y2="104" opacity="0.85" />
      </g>
      <g stroke="#a6b6ff" strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <line x1="40" y1="44" x2="56" y2="60" />
        <line x1="160" y1="44" x2="144" y2="60" />
        <line x1="44" y1="160" x2="58" y2="146" />
        <line x1="156" y1="160" x2="142" y2="146" />
      </g>

      {/* Diamond — front view brilliant cut */}
      <g transform="translate(100 104)">
        {/* Crown facets — 4 trapezoidal sections + 2 corner triangles */}
        <polygon points="-58,-26 -38,-50 -20,-26" fill="url(#d-table)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="-38,-50 0,-50 -20,-26" fill="url(#d-table-bright)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="0,-50 20,-26 -20,-26" fill="#ffffff" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" opacity="0.92" />
        <polygon points="0,-50 38,-50 20,-26" fill="url(#d-table)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="38,-50 58,-26 20,-26" fill="url(#d-pav-l)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" opacity="0.85" />

        {/* Pavilion main facets meeting at culet */}
        <polygon points="-58,-26 -36,-26 0,58" fill="url(#d-pav-l)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="-36,-26 -16,-26 0,58" fill="url(#d-pav-c)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="-16,-26 16,-26 0,58" fill="url(#d-pav-c)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" opacity="0.9" />
        <polygon points="16,-26 36,-26 0,58" fill="url(#d-pav-r)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="36,-26 58,-26 0,58" fill="url(#d-pav-r)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />

        {/* Strong table highlight */}
        <polygon points="-30,-48 24,-48 12,-30 -22,-30" fill="#ffffff" opacity="0.55" />
        <polygon points="-50,-26 -38,-50 -28,-30" fill="#ffffff" opacity="0.4" />

        {/* Girdle bright line */}
        <line x1="-58" y1="-26" x2="58" y2="-26" stroke="#ffffff" strokeWidth="1" opacity="0.6" />

        {/* Subtle pavilion shimmer line */}
        <line x1="-20" y1="-26" x2="0" y2="58" stroke="#ffffff" strokeWidth="0.8" opacity="0.35" />
      </g>

      {/* Sparkles around */}
      <g fill="#ffffff">
        <path d="M28 64 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 z" opacity="0.95" />
        <path d="M174 96 l1.2 3 l3 1.2 l-3 1.2 l-1.2 3 l-1.2 -3 l-3 -1.2 l3 -1.2 z" opacity="0.85" />
        <path d="M50 168 l0.9 2.4 l2.4 0.9 l-2.4 0.9 l-0.9 2.4 l-0.9 -2.4 l-2.4 -0.9 l2.4 -0.9 z" opacity="0.7" />
      </g>
      <g fill="#C9A24D">
        <circle cx="172" cy="40" r="1.6" opacity="0.85" />
        <circle cx="32" cy="148" r="1.4" opacity="0.7" />
      </g>
    </svg>
  )
}

function MagnifierIllustration() {
  return (
    <svg
      width="160"
      height="148"
      viewBox="0 0 200 200"
      fill="none"
      role="img"
      aria-label="Hiring manager searching for talent — urgent job vacancy Malaysia, walk-in interview, immediate hiring in Kuala Lumpur"
    >
      <defs>
        <radialGradient id="m-halo-warm" cx="0.42" cy="0.42" r="0.55">
          <stop offset="0" stopColor="#fff5db" stopOpacity="0.85" />
          <stop offset="0.55" stopColor="#fce8b3" stopOpacity="0.25" />
          <stop offset="1" stopColor="#fff7e2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="m-glass" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#f5f7ff" />
          <stop offset="1" stopColor="#dde3ee" />
        </radialGradient>
        <linearGradient id="m-ring" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#fcecb0" />
          <stop offset="0.25" stopColor="#e9c97a" />
          <stop offset="0.55" stopColor="#C9A24D" />
          <stop offset="0.85" stopColor="#8a6420" />
          <stop offset="1" stopColor="#5a3f10" />
        </linearGradient>
        <linearGradient id="m-handle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3b35" />
          <stop offset="0.5" stopColor="#1c1d18" />
          <stop offset="1" stopColor="#0a0b08" />
        </linearGradient>
        <linearGradient id="m-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Inner diamond gradients */}
        <linearGradient id="md-table" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#dbe4ff" />
          <stop offset="1" stopColor="#7b8efc" />
        </linearGradient>
        <linearGradient id="md-pav" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5468ef" />
          <stop offset="1" stopColor="#0b1742" />
        </linearGradient>
      </defs>

      {/* Warm halo */}
      <ellipse cx="86" cy="86" rx="78" ry="68" fill="url(#m-halo-warm)" />

      {/* Glass disc */}
      <circle cx="82" cy="82" r="56" fill="url(#m-glass)" />
      <circle cx="82" cy="82" r="56" fill="none" stroke="#dde3ee" strokeWidth="1" opacity="0.6" />

      {/* Inner brilliant-cut diamond */}
      <g transform="translate(82 82) scale(0.62)">
        <polygon points="-58,-26 -38,-50 0,-50 38,-50 58,-26" fill="url(#md-table)" stroke="#1a2260" strokeWidth="1.1" strokeLinejoin="round" />
        <polygon points="-58,-26 58,-26 0,58" fill="url(#md-pav)" stroke="#1a2260" strokeWidth="1.1" strokeLinejoin="round" />
        <line x1="-58" y1="-26" x2="58" y2="-26" stroke="#0b1742" strokeWidth="1" />
        <line x1="-58" y1="-26" x2="58" y2="-26" stroke="#ffffff" strokeWidth="0.5" opacity="0.5" />
        {/* Crown facets */}
        <line x1="-20" y1="-26" x2="-38" y2="-50" stroke="#1a2260" strokeWidth="0.6" opacity="0.5" />
        <line x1="0" y1="-26" x2="0" y2="-50" stroke="#1a2260" strokeWidth="0.6" opacity="0.5" />
        <line x1="20" y1="-26" x2="38" y2="-50" stroke="#1a2260" strokeWidth="0.6" opacity="0.5" />
        {/* Pavilion lines */}
        <line x1="-36" y1="-26" x2="0" y2="58" stroke="#cdd6ff" strokeWidth="0.6" opacity="0.5" />
        <line x1="-16" y1="-26" x2="0" y2="58" stroke="#cdd6ff" strokeWidth="0.6" opacity="0.5" />
        <line x1="16" y1="-26" x2="0" y2="58" stroke="#cdd6ff" strokeWidth="0.6" opacity="0.5" />
        <line x1="36" y1="-26" x2="0" y2="58" stroke="#cdd6ff" strokeWidth="0.6" opacity="0.5" />
        {/* Highlight */}
        <polygon points="-30,-48 24,-48 12,-30 -22,-30" fill="#ffffff" opacity="0.55" />
      </g>

      {/* Gold ring */}
      <circle cx="82" cy="82" r="56" fill="none" stroke="url(#m-ring)" strokeWidth="8" />
      <circle cx="82" cy="82" r="60" fill="none" stroke="#8a6420" strokeWidth="0.6" opacity="0.55" />
      <circle cx="82" cy="82" r="51.5" fill="none" stroke="#5a3f10" strokeWidth="0.6" opacity="0.45" />

      {/* Glass highlight */}
      <ellipse cx="58" cy="56" rx="14" ry="6" fill="url(#m-shine)" opacity="0.85" transform="rotate(-30 58 56)" />
      <circle cx="116" cy="50" r="3" fill="#ffffff" opacity="0.85" />

      {/* Handle */}
      <g>
        <line x1="124" y1="124" x2="178" y2="178" stroke="url(#m-handle)" strokeWidth="13" strokeLinecap="round" />
        <line x1="128" y1="128" x2="160" y2="160" stroke="#5a5c52" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
        <circle cx="178" cy="178" r="6.5" fill="url(#m-handle)" />
        <circle cx="178" cy="178" r="2" fill="#0a0b08" />
      </g>

      {/* Sparkles */}
      <g fill="#C9A24D">
        <circle cx="148" cy="32" r="1.8" opacity="0.9" />
        <circle cx="22" cy="130" r="1.4" opacity="0.7" />
      </g>
      <g fill="#ffffff">
        <path d="M30 56 l1 2.6 l2.6 1 l-2.6 1 l-1 2.6 l-1 -2.6 l-2.6 -1 l2.6 -1 z" opacity="0.85" />
      </g>
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path
        d="M11 2.5l7 2.2v5.1c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V4.7l7-2.2z"
        fill="#e8edff"
        stroke="#5468ef"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8 11.2l2 2 4-4"
        stroke="#1B2A6B"
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
