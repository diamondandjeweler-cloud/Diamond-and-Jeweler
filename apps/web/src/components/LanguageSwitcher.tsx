import { useTranslation } from 'react-i18next'
import { SUPPORTED, type Locale } from '../lib/i18n'

export default function LanguageSwitcher({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { i18n, t } = useTranslation()
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as Locale
  const colorClass = tone === 'dark'
    ? 'text-gray-400 hover:text-white'
    : 'text-gray-500 hover:text-[#0B1220]'

  return (
    <span
      role="group"
      aria-label={t('common.language')}
      className="inline-flex items-center gap-1.5 text-[10px] tracking-wide"
    >
      {SUPPORTED.map((loc, i) => {
        const active = loc.code === current
        return (
          <span key={loc.code} className="inline-flex items-center">
            {i > 0 && <span className={`mx-1 ${colorClass} opacity-60`}>·</span>}
            <button
              type="button"
              onClick={() => { void i18n.changeLanguage(loc.code) }}
              aria-pressed={active}
              className={`${colorClass} ${active ? 'font-semibold underline underline-offset-2' : ''} transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B2A6B] focus:ring-offset-1 rounded`}
            >
              {loc.label}
            </button>
          </span>
        )
      })}
    </span>
  )
}
