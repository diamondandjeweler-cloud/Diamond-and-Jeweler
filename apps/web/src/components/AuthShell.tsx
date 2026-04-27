import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Two-column layout used by the sign-in / sign-up / reset screens.
 * Left column: the form (on a clean white surface).
 * Right column: a quiet brand panel (dark, image-free, copy-led).
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
  panelTitle = 'Precision recruitment, powered by AI',
  panelBullets = [
    'AI-curated matches — only roles genuinely aligned to your career profile',
    'Three offers at a time — quality over volume, zero application fatigue',
    'Proprietary compatibility engine that goes far beyond the résumé',
    'Your profile works passively — no job boards, no cold applications',
    'Advanced multi-dimensional career analysis for precision employer fit',
    'Candidate confidentiality — employers see only what you choose to share',
    'End-to-end encrypted personal data, fully PDPA-compliant',
    'Early visibility into roles before they reach the open market',
    'Personalised career trajectory insights delivered over time',
  ],
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  panelTitle?: string
  panelBullets?: string[]
}) {
  return (
    <div className="min-h-screen bg-ink-50 grid lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col justify-center px-6 md:px-10 py-10">
        <div className="max-w-md w-full mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 mb-10" aria-label="DNJ home">
            <Logo />
            <span className="font-display text-xl text-ink-900">DNJ</span>
          </Link>

          <h1 className="font-display text-3xl text-ink-900 mb-1">{title}</h1>
          {subtitle && <p className="text-ink-500 text-sm mb-8">{subtitle}</p>}
          {!subtitle && <div className="mb-8" />}

          {children}

          {footer && <div className="mt-6 text-sm text-center text-ink-600">{footer}</div>}
        </div>
      </div>

      {/* Brand side */}
      <div className="hidden lg:block relative overflow-hidden bg-ink-900 text-white">
        <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        <div className="relative h-full flex flex-col justify-between p-10 xl:p-14">
          <div className="text-xs uppercase tracking-widest text-ink-300">DNJ</div>
          <div className="max-w-md">
            <h2 className="font-display text-4xl xl:text-5xl mb-6 leading-tight">{panelTitle}</h2>
            <ul className="space-y-3 text-ink-200 text-sm">
              {panelBullets.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent-500 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="text-xs text-ink-300">
            © 2026 DNJ · <Link to="/privacy" className="hover:text-white">Privacy</Link> · <Link to="/terms" className="hover:text-white">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="auth-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a2260" />
          <stop offset="1" stopColor="#3e4fd3" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#auth-logo-grad)" />
      <polygon points="7,15 16,5 25,15" fill="rgba(245,247,255,0.18)" stroke="#f5f7ff" strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="7" y1="15" x2="25" y2="15" stroke="#f5f7ff" strokeWidth="1" opacity="0.7" />
      <polygon points="7,15 25,15 16,28" fill="rgba(245,247,255,0.32)" stroke="#f5f7ff" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="13" cy="10" r="1" fill="#f5f7ff" opacity="0.75" />
    </svg>
  )
}
