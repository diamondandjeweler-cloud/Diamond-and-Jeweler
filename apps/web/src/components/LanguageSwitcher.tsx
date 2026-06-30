import { useTranslation } from 'react-i18next'

/**
 * Header language switcher — a small, accessible segmented control.
 *
 * Calls i18n.changeLanguage(code) so the choice is applied immediately and
 * persisted by i18next-browser-languagedetector (localStorage 'i18nextLng').
 * The current language is read live from i18n.language and highlighted; the
 * region suffix (e.g. 'en-MY') is normalised to its base code for matching.
 */
const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'ms', label: 'BM' },
  { code: 'zh', label: '中文' },
] as const

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0]

  return (
    <div className="hidden sm:inline-flex items-center gap-1.5">
      <div
        role="group"
        aria-label={t('common.language')}
        className="inline-flex items-center rounded-md bg-ink-50 p-0.5 text-xs font-medium"
      >
        {LANGUAGES.map((lang) => {
          const active = lang.code === current
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => { void i18n.changeLanguage(lang.code) }}
              aria-pressed={active}
              className={`px-2 py-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                active
                  ? 'bg-white text-ink-900 shadow-soft'
                  : 'text-ink-500 hover:text-ink-900'
              }`}
            >
              {lang.label}
            </button>
          )
        })}
      </div>
      {/* Honest "machine-assisted" affordance: the ms/zh copy is not yet
          native-reviewed, so flag it as beta + invite corrections rather than
          imply finished translations. Hidden for English. defaultValue keeps it
          working before the keys land in the locale files. */}
      {current !== 'en' && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide text-accent-700 bg-accent-500/10 ring-1 ring-accent-500/20"
          title={t('common.translationBetaHint', {
            defaultValue: 'These translations are machine-assisted and still being improved — tell us if anything reads wrong.',
          })}
        >
          {t('common.translationBeta', { defaultValue: 'beta' })}
        </span>
      )}
    </div>
  )
}
