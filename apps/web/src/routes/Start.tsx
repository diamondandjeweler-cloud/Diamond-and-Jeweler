import { Link, Navigate, useParams } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'

/**
 * Splash between the landing icons and sign-up / sign-in.
 *   /start/talent  → diamond path
 *   /start/hiring  → magnifier path (HMs still arrive via invite)
 */
export default function Start() {
  const { side } = useParams<{ side: string }>()
  const isTalent = side === 'talent'
  useSeo({
    title: isTalent ? 'Find your next role' : 'Hire with precision',
    description: isTalent
      ? 'DNJ matches talent in Malaysia with exactly three curated roles at a time. Zero noise, three real opportunities.'
      : 'DNJ delivers exactly three qualified candidates per open role to hiring managers and HR teams across Malaysia.',
  })
  if (side !== 'talent' && side !== 'hiring') {
    return <Navigate to="/" replace />
  }

  const heading = isTalent ? 'Welcome, talent.' : 'Welcome, hiring manager.'
  const subheading = isTalent
    ? "Let's get your profile built — takes about 10 minutes."
    : 'Hire with curation, not résumé piles.'
  const eyebrow = isTalent ? 'TALENT FLOW' : 'HIRING FLOW'
  const signupRole = isTalent ? 'talent' : 'hr_admin'

  return (
    <div className="relative h-screen flex flex-col overflow-hidden bg-white text-[#0B1220] font-sans">
      <BackgroundDecor />

      <a
        href="#start-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-[#0B1220] text-white px-3 py-2 rounded z-50 text-sm"
      >
        Skip to main content
      </a>

      {/* Top Bar */}
      <header className="relative z-10 px-6 md:px-12 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
        <Link to="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-[#0B1220] text-sm font-medium" aria-label="Back to home">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M12 7H2m0 0l4-4m-4 4l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </Link>

        <Link to="/" className="flex items-center gap-2.5" aria-label="DNJ home">
          <BrandMark />
          <div className="hidden sm:block leading-none">
            <div className="font-sans font-extrabold text-[20px] tracking-tight text-[#0B1220]">DNJ</div>
            <div className="text-[9px] font-medium tracking-[0.22em] text-gray-500 mt-0.5">DIAMOND &amp; JEWELER</div>
          </div>
        </Link>

        <div className="inline-flex items-center gap-2 border border-gray-300 px-3.5 py-1.5 rounded-full text-xs text-gray-700 bg-white shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#C9A24D]" />
          {eyebrow.split(' ')[0].charAt(0) + eyebrow.split(' ')[0].slice(1).toLowerCase()} flow
        </div>
      </header>

      <main id="start-main" className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-2 min-h-0">
        <div className="text-center max-w-md w-full">
          <div className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-3">
            {eyebrow}
          </div>

          <div
            className="relative mx-auto mb-5 h-32 md:h-40 w-full flex items-center justify-center"
            style={{
              clipPath: 'polygon(24px 0, calc(100% - 24px) 0, 100% 24px, 100% calc(100% - 24px), calc(100% - 24px) 100%, 24px 100%, 0 calc(100% - 24px), 0 24px)',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-[#f5f7ff] to-white ring-1 ring-[#e8edff]" />
            <div className="relative">
              {isTalent ? <DiamondIllustration /> : <MagnifierIllustration />}
            </div>
          </div>

          <h1 className="font-sans font-bold text-[30px] md:text-[40px] leading-[1.05] tracking-tight text-[#0B1220] mb-2">
            {heading}
          </h1>
          <p className="text-gray-600 text-[15px] mb-7 leading-snug">{subheading}</p>

          <div className="space-y-2.5">
            <Link
              to={`/signup?role=${signupRole}`}
              className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl bg-[#0B1742] text-white text-[15px] font-semibold
                         shadow-[0_4px_14px_rgba(11,23,66,0.4)]
                         hover:bg-[#1B2A6B] hover:shadow-[0_8px_22px_rgba(11,23,66,0.5)]
                         transition-all"
            >
              Create new account
              <Arrow />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl bg-white text-[#0B1220] text-[15px] font-semibold
                         border border-gray-300
                         hover:bg-gray-50 hover:border-gray-400
                         transition-all"
            >
              I already have an account
            </Link>
          </div>

          {isTalent && (
            <p className="mt-5 text-[11px] text-gray-500 leading-relaxed max-w-sm mx-auto">
              You'll upload your ID and résumé, chat with our interviewer, then wait for your first three curated offers. Everything is encrypted and never shared without your consent.
            </p>
          )}
        </div>
      </main>

      <footer className="relative z-10 pt-1 pb-2 text-center text-[10px] text-gray-500 flex-shrink-0">
        <Link to="/privacy" className="hover:text-[#0B1220]">Privacy</Link>
        <span className="mx-2">·</span>
        <Link to="/terms" className="hover:text-[#0B1220]">Terms</Link>
        <span className="mx-2">·</span>
        <span>© 2026 DNJ</span>
      </footer>
    </div>
  )
}

function BackgroundDecor() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#f5f7ff]/40 via-white to-[#fffaf1]/30" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #1B2A6B 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Left blueprint diamond */}
      <svg
        aria-hidden
        viewBox="0 0 600 800"
        className="pointer-events-none absolute -left-32 top-16 w-[500px] h-[640px] text-[#a6b6ff] opacity-[0.3]"
        fill="none"
      >
        <g stroke="currentColor" strokeWidth="0.7">
          <polygon points="120,300 280,140 440,300 280,640" />
          <polygon points="180,300 280,200 380,300 280,540" />
          <line x1="120" y1="300" x2="440" y2="300" />
          <path d="M 0 360 L 80 360 L 100 340 L 160 340" />
          <path d="M 0 460 L 60 460 L 80 440 L 120 440" />
        </g>
        <g fill="currentColor">
          <circle cx="80" cy="360" r="2" />
          <circle cx="60" cy="460" r="2" />
        </g>
      </svg>
      {/* Right circular tech */}
      <svg
        aria-hidden
        viewBox="0 0 600 800"
        className="pointer-events-none absolute -right-32 top-12 w-[460px] h-[620px] text-[#a6b6ff] opacity-[0.28]"
        fill="none"
      >
        <g stroke="currentColor" strokeWidth="0.7">
          <circle cx="380" cy="340" r="220" opacity="0.55" />
          <circle cx="380" cy="340" r="160" opacity="0.45" />
          <circle cx="380" cy="340" r="100" opacity="0.35" />
          <path d="M 600 280 L 540 280 L 520 260 L 480 260" />
          <path d="M 600 380 L 560 380 L 540 400 L 500 400" />
        </g>
        <g fill="currentColor">
          <circle cx="540" cy="280" r="2" />
          <circle cx="560" cy="380" r="2" />
        </g>
      </svg>
      {/* Sparkle dots */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 w-full h-full opacity-50">
        <g fill="#a6b6ff">
          <circle cx="14%" cy="22%" r="1.4" />
          <circle cx="86%" cy="18%" r="1.2" />
          <circle cx="92%" cy="64%" r="1.4" />
          <circle cx="8%" cy="74%" r="1.2" />
        </g>
      </svg>
    </>
  )
}

function BrandMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 44 44" fill="none" aria-hidden>
      <defs>
        <linearGradient id="sm-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a6b6ff" />
          <stop offset="1" stopColor="#5468ef" />
        </linearGradient>
        <linearGradient id="sm-pav" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3e4fd3" />
          <stop offset="1" stopColor="#0b1742" />
        </linearGradient>
      </defs>
      <polygon points="6,16 22,4 38,16" fill="url(#sm-crown)" stroke="#0b1742" strokeWidth="0.9" strokeLinejoin="round" />
      <polygon points="6,16 38,16 22,40" fill="url(#sm-pav)" stroke="#0b1742" strokeWidth="0.9" strokeLinejoin="round" />
      <line x1="6" y1="16" x2="38" y2="16" stroke="#0b1742" strokeWidth="0.6" />
      <polygon points="9,15 22,5 19,15" fill="#ffffff" opacity="0.55" />
    </svg>
  )
}

function DiamondIllustration() {
  return (
    <svg width="140" height="130" viewBox="0 0 200 200" fill="none" aria-hidden>
      <defs>
        <radialGradient id="sd-halo" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0" stopColor="#cdd6ff" stopOpacity="0.85" />
          <stop offset="0.4" stopColor="#a6b6ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#a6b6ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sd-table" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#dbe4ff" />
          <stop offset="1" stopColor="#7b8efc" />
        </linearGradient>
        <linearGradient id="sd-pav-l" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b8efc" />
          <stop offset="1" stopColor="#1a2260" />
        </linearGradient>
        <linearGradient id="sd-pav-c" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5468ef" />
          <stop offset="1" stopColor="#0b1742" />
        </linearGradient>
        <linearGradient id="sd-pav-r" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3e4fd3" />
          <stop offset="1" stopColor="#0b1742" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="104" rx="92" ry="80" fill="url(#sd-halo)" />
      <g stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <line x1="100" y1="14" x2="100" y2="36" />
        <line x1="14" y1="104" x2="38" y2="104" />
        <line x1="162" y1="104" x2="186" y2="104" />
      </g>
      <g transform="translate(100 104)">
        <polygon points="-58,-26 -38,-50 -20,-26" fill="url(#sd-table)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="-38,-50 0,-50 -20,-26" fill="#ffffff" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" opacity="0.95" />
        <polygon points="0,-50 20,-26 -20,-26" fill="url(#sd-table)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="0,-50 38,-50 20,-26" fill="url(#sd-table)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" opacity="0.85" />
        <polygon points="38,-50 58,-26 20,-26" fill="url(#sd-pav-l)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" opacity="0.85" />
        <polygon points="-58,-26 -36,-26 0,58" fill="url(#sd-pav-l)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="-36,-26 -16,-26 0,58" fill="url(#sd-pav-c)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="-16,-26 16,-26 0,58" fill="url(#sd-pav-c)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" opacity="0.9" />
        <polygon points="16,-26 36,-26 0,58" fill="url(#sd-pav-r)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="36,-26 58,-26 0,58" fill="url(#sd-pav-r)" stroke="#1a2260" strokeWidth="1" strokeLinejoin="round" />
        <polygon points="-30,-48 24,-48 12,-30 -22,-30" fill="#ffffff" opacity="0.55" />
        <line x1="-58" y1="-26" x2="58" y2="-26" stroke="#ffffff" strokeWidth="1" opacity="0.6" />
      </g>
      <g fill="#ffffff">
        <path d="M28 64 l1.4 3.6 l3.6 1.4 l-3.6 1.4 l-1.4 3.6 l-1.4 -3.6 l-3.6 -1.4 l3.6 -1.4 z" opacity="0.9" />
        <path d="M174 96 l1 2.6 l2.6 1 l-2.6 1 l-1 2.6 l-1 -2.6 l-2.6 -1 l2.6 -1 z" opacity="0.85" />
      </g>
    </svg>
  )
}

function MagnifierIllustration() {
  return (
    <svg width="140" height="130" viewBox="0 0 200 200" fill="none" aria-hidden>
      <defs>
        <radialGradient id="sm-halo-warm" cx="0.42" cy="0.42" r="0.55">
          <stop offset="0" stopColor="#fff5db" stopOpacity="0.85" />
          <stop offset="0.55" stopColor="#fce8b3" stopOpacity="0.25" />
          <stop offset="1" stopColor="#fff7e2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sm-glass" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#f5f7ff" />
          <stop offset="1" stopColor="#dde3ee" />
        </radialGradient>
        <linearGradient id="sm-ring" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#fcecb0" />
          <stop offset="0.25" stopColor="#e9c97a" />
          <stop offset="0.55" stopColor="#C9A24D" />
          <stop offset="0.85" stopColor="#8a6420" />
          <stop offset="1" stopColor="#5a3f10" />
        </linearGradient>
        <linearGradient id="sm-handle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3b35" />
          <stop offset="0.5" stopColor="#1c1d18" />
          <stop offset="1" stopColor="#0a0b08" />
        </linearGradient>
        <linearGradient id="smd-table" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#dbe4ff" />
          <stop offset="1" stopColor="#7b8efc" />
        </linearGradient>
        <linearGradient id="smd-pav" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5468ef" />
          <stop offset="1" stopColor="#0b1742" />
        </linearGradient>
      </defs>
      <ellipse cx="86" cy="86" rx="78" ry="68" fill="url(#sm-halo-warm)" />
      <circle cx="82" cy="82" r="56" fill="url(#sm-glass)" />
      <g transform="translate(82 82) scale(0.62)">
        <polygon points="-58,-26 -38,-50 0,-50 38,-50 58,-26" fill="url(#smd-table)" stroke="#1a2260" strokeWidth="1.1" strokeLinejoin="round" />
        <polygon points="-58,-26 58,-26 0,58" fill="url(#smd-pav)" stroke="#1a2260" strokeWidth="1.1" strokeLinejoin="round" />
        <line x1="-58" y1="-26" x2="58" y2="-26" stroke="#0b1742" strokeWidth="1" />
        <polygon points="-30,-48 24,-48 12,-30 -22,-30" fill="#ffffff" opacity="0.55" />
      </g>
      <circle cx="82" cy="82" r="56" fill="none" stroke="url(#sm-ring)" strokeWidth="8" />
      <circle cx="82" cy="82" r="60" fill="none" stroke="#8a6420" strokeWidth="0.6" opacity="0.55" />
      <ellipse cx="58" cy="56" rx="14" ry="6" fill="#ffffff" opacity="0.7" transform="rotate(-30 58 56)" />
      <line x1="124" y1="124" x2="178" y2="178" stroke="url(#sm-handle)" strokeWidth="13" strokeLinecap="round" />
      <circle cx="178" cy="178" r="6.5" fill="url(#sm-handle)" />
      <g fill="#C9A24D">
        <circle cx="148" cy="32" r="1.8" opacity="0.9" />
        <circle cx="22" cy="130" r="1.4" opacity="0.7" />
      </g>
    </svg>
  )
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 7h10m0 0L8 3m4 4L8 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
