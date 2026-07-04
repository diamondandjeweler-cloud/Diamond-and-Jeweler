import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Arrow } from './svg'

// ─────────────────────────────────────────────────────────────────────────────
// First-screen (above-the-fold) presentational pieces for the public Landing
// page: the two decision cards, the "OR" divider, and the SEO popular-searches
// block. Relocated verbatim from routes/Landing.tsx — no copy, className, link
// target or markup changes.
// ─────────────────────────────────────────────────────────────────────────────

function PopularSearchesImpl() {
  const { t } = useTranslation()
  // SEO-only keyword block — non-interactive plain text spans so search-engine
  // crawlers index the keyword phrases for relevance, but human users have
  // no clickable target. Wrapped in collapsed <details> so the block isn't
  // visually loud either; users can choose to expand to read.
  // NOTE: TERMS stay literal English — they are crawler-indexed SEO keyword
  // phrases, not translatable UI copy.
  const TERMS = [
    'Jobs near me', 'Job vacancy near me', 'Urgent hiring near me', 'Walk in interview',
    'Hiring immediately', 'Apply job online', 'Latest job vacancy', 'Part time job near me',
    'Full time job', 'Fresh graduate job', 'No experience job', 'Immediate hiring',
    'Hiring now', 'Pilot job vacancy', 'Cadet pilot program', 'Aviation job vacancy',
    'Jeweler job vacancy', 'Diamond expert job vacancy', 'Gemologist job',
    'Luxury retail job vacancy', 'Sales executive job vacancy',
    'Account assistant job vacancy', 'Admin executive job vacancy',
    'Software developer job vacancy', 'Graphic designer job vacancy',
    'Marketing executive job vacancy', 'Customer service job vacancy',
    'HR assistant job vacancy', 'Finance job vacancy', 'Operation job vacancy',
    'Job vacancy in Kuala Lumpur', 'Job vacancy in PJ', 'Job vacancy in Penang',
    'Job vacancy in Malaysia', 'Work from home Kuala Lumpur', 'Remote job Malaysia',
    'Internship', 'Graduate trainee program', 'Diploma holder job', 'SPM leaver job',
    'Urgent hiring near me 2026',
  ]
  return (
    <details className="text-[10px] text-gray-500 max-w-3xl mx-auto px-4">
      <summary className="cursor-pointer hover:text-gray-700 list-none select-none">
        {t('landing.popularSearches')}
      </summary>
      <div
        role="list"
        aria-label={t('landing.popularSearchesAria')}
        className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 leading-relaxed select-text"
      >
        {TERMS.map((term) => (
          <span key={term} role="listitem">
            {term}
          </span>
        ))}
      </div>
    </details>
  )
}
export const PopularSearches = memo(PopularSearchesImpl)

function DecisionCardImpl({
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
      onMouseDown={() => {
        // Best-effort prefetch of the destination route chunk so the click
        // feels instant. Both landing cards link to /start/* which render
        // routes/Start.tsx. Never throws — warming the chunk is optional.
        try {
          if (to.startsWith('/start')) import('../Start').catch(() => {})
        } catch {
          /* no-op: prefetch is purely a nicety */
        }
      }}
      className="group relative block px-6 md:px-8 pt-5 pb-6 text-center transition-all duration-300
                 bg-gradient-to-b from-white to-[#fafbff] dark:from-[#111827] dark:to-[#0d1528]
                 ring-1 ring-[#e8edff] dark:ring-[#1e2d52]
                 shadow-[0_2px_4px_rgba(20,21,17,0.04),0_14px_36px_-14px_rgba(39,48,110,0.12)]
                 hover:shadow-[0_4px_8px_rgba(20,21,17,0.05),0_24px_48px_-12px_rgba(39,48,110,0.22)]
                 hover:-translate-y-0.5
                 active:scale-[0.98] active:opacity-75"
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
      <p className="text-[13px] text-gray-600 dark:text-gray-400 max-w-xs mx-auto mb-4 leading-snug">
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
export const DecisionCard = memo(DecisionCardImpl)

function OrDividerImpl() {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-0 hidden md:flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-2">
        <div className="h-12 w-px bg-gradient-to-b from-transparent to-gray-300" />
        <span className="text-[10px] font-medium tracking-[0.2em] text-gray-400 uppercase">{t('landing.or')}</span>
        <div className="h-12 w-px bg-gradient-to-b from-gray-300 to-transparent" />
      </div>
    </div>
  )
}
export const OrDivider = memo(OrDividerImpl)
