import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import enTranslations from '../locales/en.json'

export const SUPPORTED = [
  { code: 'en', label: 'English' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'zh', label: '中文' },
] as const
export type Locale = typeof SUPPORTED[number]['code']

// Only 'en' is bundled statically for first paint. 'ms' and 'zh' are
// lazy-loaded on demand via native dynamic import() the first time the
// language is detected or switched to.
const lazyLoaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  ms: () => import('../locales/ms.json'),
  zh: () => import('../locales/zh.json'),
}
const loaded = new Set<string>(['en'])

async function ensureBundle(lng: string | undefined): Promise<void> {
  // Normalize e.g. 'zh-CN' -> 'zh' to match load: 'languageOnly'.
  const code = (lng ?? '').split('-')[0]
  if (!code || loaded.has(code)) return
  const loader = lazyLoaders[code]
  if (!loader) return
  loaded.add(code)
  try {
    const mod = await loader()
    i18n.addResourceBundle(code, 'translation', mod.default, true, true)
    // Re-render into the now-loaded language if it is still the one the user
    // wants. Compare the DETECTED language (i18n.language, normalized) — NOT
    // resolvedLanguage, which is 'en' until this bundle lands.
    if ((i18n.language ?? '').split('-')[0] === code) {
      await i18n.changeLanguage(i18n.language)
    }
  } catch {
    // Loading failed; allow a future attempt and fall back to en.
    loaded.delete(code)
  }
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
    },
    fallbackLng: 'en',
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: { escapeValue: false },
    // Don't throw/suspend when switching to a not-yet-loaded language;
    // it falls back to en and re-renders once the bundle arrives.
    react: { useSuspense: false },
  })
  .then(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
    // Load the DETECTED language's bundle if it wasn't bundled statically.
    // Must use i18n.language (the raw detected 'zh'/'ms'), NOT resolvedLanguage
    // — the latter resolves to the fallback 'en' until this bundle loads, so it
    // would no-op and a returning zh/ms user would stay stuck in English.
    void ensureBundle(i18n.language)
  })

// Lazy-load the target bundle whenever the language changes.
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng ?? 'en'
  void ensureBundle(lng)
})

export default i18n
