import { memo } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Shared static SVG / icon primitives for the public Landing page.
// Relocated verbatim from routes/Landing.tsx — behavior-preserving, no copy or
// markup changes. These are pure, prop-less presentational components reused by
// the hero, decision cards and below-the-fold sections.
// ─────────────────────────────────────────────────────────────────────────────

function BackgroundDecorImpl() {
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
export const BackgroundDecor = memo(BackgroundDecorImpl)

function BrandMarkImpl() {
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
export const BrandMark = memo(BrandMarkImpl)

function DiamondIllustrationImpl() {
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
export const DiamondIllustration = memo(DiamondIllustrationImpl)

function MagnifierIllustrationImpl() {
  return (
    <svg
      width="160"
      height="148"
      viewBox="0 0 200 200"
      fill="none"
      role="img"
      aria-label="Hiring manager searching for talent — AI-curated job vacancy Malaysia, precision matching in Kuala Lumpur"
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
export const MagnifierIllustration = memo(MagnifierIllustrationImpl)

function ShieldIconImpl() {
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
export const ShieldIcon = memo(ShieldIconImpl)

function ArrowImpl() {
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
export const Arrow = memo(ArrowImpl)

/** Step arrow — horizontal on desktop, vertical on mobile */
function StepArrowImpl() {
  return (
    <div className="flex items-center justify-center text-[#C9A24D]" aria-hidden>
      {/* Desktop: → */}
      <svg className="hidden md:block" width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M4 14h20m0 0l-7-7m7 7l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* Mobile: ↓ */}
      <svg className="block md:hidden" width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 4v20m0 0l-7-7m7 7l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
export const StepArrow = memo(StepArrowImpl)
