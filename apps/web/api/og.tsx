/**
 * GET /api/og?title=...&description=...&page=...
 * Generates per-page Open Graph images on-the-fly using @vercel/og.
 * Called from inject-meta.mjs which sets og:image to /api/og?page=...
 *
 * Brand palette: #0B1220 navy · #C9A24D gold · #5468ef blue · white
 */
import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

const BASE = 'https://diamondandjeweler.com'

const PAGE_META: Record<string, { title: string; sub: string }> = {
  home:     { title: 'We connect brilliance with opportunity.',       sub: 'AI-curated recruitment · Malaysia · Three matches, zero noise' },
  careers:  { title: 'Job Vacancy Malaysia — All Industries',         sub: 'Salary-tagged roles · Every industry · PDPA-compliant matching' },
  about:    { title: "You're already a diamond.\nLet the world see it.", sub: 'Meet Bole — the AI that recognises your brilliance' },
  pilot:    { title: 'Pilot & Cadet Pilot Jobs — Malaysia',           sub: 'Cadet program · First officer · Captain · AI-curated · Apply online' },
  jeweler:  { title: 'Jeweler / Diamond Grader Jobs — Malaysia',      sub: 'Bench jeweler · Grader · Gemologist · GIA path · KL & PJ' },
  luxury:   { title: 'Luxury Retail Jobs — Kuala Lumpur',             sub: 'Sales associate · Clienteling · Boutique manager · KLCC & Pavilion' },
  software: { title: 'Software Developer Jobs — Remote & Hybrid',     sub: 'Full-stack · Frontend · Backend · RM 4k–15k · Malaysia' },
  pricing:  { title: 'Pricing — Talent joins free. Hiring by enquiry.', sub: 'No CV pile · Three curated matches · PDPA-compliant' },
}

export default function handler(req: Request): Response {
  const url  = new URL(req.url)
  const page = url.searchParams.get('page') ?? 'home'
  const meta = PAGE_META[page] ?? PAGE_META['home']

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '1200px',
        height: '630px',
        background: 'linear-gradient(135deg,#0B1742 0%,#0B1220 60%,#111828 100%)',
        padding: '60px',
        fontFamily: 'system-ui, sans-serif',
        position: 'relative',
      }}
    >
      {/* Top-left diamond mark (SVG inline) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
        <svg width="48" height="48" viewBox="0 0 44 44" fill="none">
          <polygon points="6,16 22,4 38,16" fill="#a6b6ff" />
          <polygon points="6,16 38,16 22,40" fill="#0b1742" />
          <polygon points="9,15 22,5 19,15" fill="#ffffff" opacity="0.6" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#ffffff', fontWeight: 800, fontSize: '28px', letterSpacing: '-0.02em' }}>DNJ</span>
          <span style={{ color: '#a6b6ff', fontSize: '11px', letterSpacing: '0.22em', marginTop: '2px' }}>DIAMOND &amp; JEWELER</span>
        </div>
      </div>

      {/* Main title */}
      <div style={{
        color: '#ffffff',
        fontSize: meta.title.length > 40 ? '52px' : '60px',
        fontWeight: 800,
        lineHeight: 1.1,
        letterSpacing: '-0.02em',
        maxWidth: '900px',
        flexGrow: 1,
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'pre-wrap',
      }}>
        {meta.title}
      </div>

      {/* Subtitle */}
      <div style={{ color: '#a6b6ff', fontSize: '22px', marginTop: '24px', letterSpacing: '-0.01em' }}>
        {meta.sub}
      </div>

      {/* Bottom gold strip */}
      <div style={{
        position: 'absolute',
        bottom: '0',
        left: '0',
        right: '0',
        height: '6px',
        background: 'linear-gradient(90deg,#C9A24D,#f0c96b,#C9A24D)',
      }} />
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    },
  )
}
