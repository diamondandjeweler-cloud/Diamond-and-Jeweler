/**
 * i18n — react-i18next setup with lazy per-locale loading.
 * Only the active locale bundle is downloaded; the other two are fetched
 * on demand if the user switches language. Previously all three were
 * statically imported (~58 KB uncompressed total → ~19 KB on the wire).
 *
 * Detection order: localStorage > navigator > default('en').
 */
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

export const SUPPORTED = [
  { code: 'en', label: 'English' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'zh', label: '中文' },
] as const
export type Locale = typeof SUPPORTED[number]['code']

const LOCALE_LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  en: () => import('../locales/en.json').then((m) => m.default as Record<string, unknown>),
  ms: () => import('../locales/ms.json').then((m) => m.default as Record<string, unknown>),
  zh: () => import('../locales/zh.json').then((m) => m.default as Record<string, unknown>),
}

async function loadLocale(lng: string) {
  if (i18n.hasResourceBundle(lng, 'translation')) return
  const loader = LOCALE_LOADERS[lng]
  if (!loader) return
  const bundle = await loader()
  i18n.addResourceBundle(lng, 'translation', bundle, true, true)
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {},          // populated lazily below
    fallbackLng: 'en',
    supportedLngs: ['en', 'ms', 'zh'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'bole.locale',
    },
    // Suppress "no translations found" warning until bundles load.
    partialBundledLanguages: true,
  })
  .then(async () => {
    await loadLocale(i18n.language)
    document.documentElement.lang = i18n.language
  })

i18n.on('languageChanged', async (lng) => {
  await loadLocale(lng)
  document.documentElement.lang = lng
})

export default i18n
