import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from './Logo'

export type AuthVariant = 'talent' | 'hiring'

const VARIANT_CONFIG = {
  talent: {
    tag: 'FOR TALENT',
    accentColor: '#c9a84c',
    bgFrom: '#080810',
    bgTo: '#0e0e22',
    gridColor: '#c9a84c',
    glowColor: 'rgba(201,168,76,0.08)',
    logoGradFrom: '#b8860b',
    logoGradTo: '#e8c55a',
  },
  hiring: {
    tag: 'FOR COMPANIES',
    accentColor: '#3b82f6',
    bgFrom: '#040d1c',
    bgTo: '#071428',
    gridColor: '#3b82f6',
    glowColor: 'rgba(59,130,246,0.08)',
    logoGradFrom: '#1d4ed8',
    logoGradTo: '#60a5fa',
  },
} as const

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
  variant = 'talent',
  panelTitle,
  panelBullets,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  variant?: AuthVariant
  panelTitle?: string
  panelBullets?: string[]
}) {
  const { t } = useTranslation()
  const cfg = VARIANT_CONFIG[variant]

  const defaultPanelTitle =
    variant === 'talent'
      ? 'Precision recruitment, powered by AI'
      : 'Find the right hire, not just any hire'

  const defaultBullets =
    variant === 'talent'
      ? [
          'AI-curated matches — only roles genuinely aligned to your career profile',
          'Three offers at a time — quality over volume, zero application fatigue',
          'Proprietary compatibility engine that goes far beyond the résumé',
          'Your profile works passively — no job boards, no cold applications',
          'Advanced multi-dimensional career analysis for precision employer fit',
          'Candidate confidentiality — employers see only what you choose to share',
          'End-to-end encrypted personal data, fully PDPA-compliant',
          'Early visibility into roles before they reach the open market',
          'Personalised career trajectory insights delivered over time',
        ]
      : [
          'AI-matched candidates — only talent genuinely aligned to your requirements',
          'Receive up to three curated profiles per role — no CV pile, no noise',
          'Proprietary compatibility engine that scores culture fit, trajectory, and compensation',
          'Access passive talent — your next hire may not be actively job-hunting',
          'Multi-dimensional analysis: skills, culture alignment, career goals',
          'Full candidate confidentiality until mutual interest is confirmed',
          'PDPA-compliant data handling with end-to-end encryption',
          'Early access to talent before they reach the open market',
          'Hiring intelligence reports delivered with every match',
        ]

  const bullets = panelBullets ?? defaultBullets
  const heading = panelTitle ?? defaultPanelTitle

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* ── Form side ─────────────────────────────────────── */}
      <div className="flex flex-col justify-center px-6 md:px-10 py-10 bg-white">
        <div className="max-w-md w-full mx-auto">
          {/* Accent bar */}
          <div
            className="h-px w-10 mb-10 rounded-full"
            style={{ backgroundColor: cfg.accentColor }}
          />

          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-2 mb-8" aria-label="DNJ home">
            <Logo
              size={28}
              gradFrom={cfg.logoGradFrom}
              gradTo={cfg.logoGradTo}
              gradId={`logo-grad-${cfg.logoGradFrom.replace('#', '')}`}
            />
            <span className="font-sans font-semibold text-xl tracking-wide" style={{ color: '#0a0a0f' }}>
              DNJ
            </span>
          </Link>

          {/* Role pill */}
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase mb-5"
            style={{
              backgroundColor: `${cfg.accentColor}18`,
              color: cfg.accentColor,
              border: `1px solid ${cfg.accentColor}30`,
            }}
          >
            <span
              className="h-1 w-1 rounded-full"
              style={{ backgroundColor: cfg.accentColor }}
            />
            {cfg.tag}
          </div>

          <h1 className="font-display text-[1.85rem] leading-tight text-ink-900 mb-1.5">{title}</h1>
          {subtitle && <p className="text-ink-500 text-sm mb-8 leading-relaxed">{subtitle}</p>}
          {!subtitle && <div className="mb-8" />}

          {children}

          {footer && <div className="mt-6 text-sm text-center text-ink-600">{footer}</div>}
        </div>
      </div>

      {/* ── Brand panel ───────────────────────────────────── */}
      <div
        className="hidden lg:block relative overflow-hidden text-white"
        style={{ background: `linear-gradient(150deg, ${cfg.bgFrom} 0%, ${cfg.bgTo} 100%)` }}
      >
        {/* Fine grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(${cfg.gridColor}22 1px, transparent 1px),
              linear-gradient(90deg, ${cfg.gridColor}22 1px, transparent 1px)
            `,
            backgroundSize: '44px 44px',
          }}
        />

        {/* Radial glow */}
        <div
          className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none"
          style={{ background: cfg.glowColor }}
        />

        {/* Corner glow */}
        <div
          className="absolute bottom-0 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none"
          style={{ background: `${cfg.accentColor}10` }}
        />

        <div className="relative h-full flex flex-col justify-between p-10 xl:p-14">
          {/* Top tag */}
          <div
            className="text-[10px] font-bold tracking-[0.18em] uppercase"
            style={{ color: cfg.accentColor }}
          >
            DNJ — AI Recruitment
          </div>

          {/* Main content */}
          <div className="max-w-sm">
            <h2 className="font-display text-4xl xl:text-[2.8rem] mb-8 leading-[1.1] text-white">
              {heading}
            </h2>

            <ul className="space-y-3.5">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span
                    className="mt-[7px] h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: cfg.accentColor }}
                  />
                  <span className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.68)' }}>
                    {b}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer */}
          <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            © 2026 DNJ ·{' '}
            <Link to="/privacy" className="hover:text-white transition-colors duration-150">
              {t('footer.privacy')}
            </Link>{' '}
            ·{' '}
            <Link to="/terms" className="hover:text-white transition-colors duration-150">
              {t('footer.terms')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

