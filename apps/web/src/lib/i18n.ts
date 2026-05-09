import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enTranslations from '../locales/en.json'

// Lazy chunks for non-default locales — keeps the initial bundle small for
// the ~95% of users who land in English. Lighthouse caught the eager imports
// of ms.json + zh.json as ~69 KiB of unused JavaScript on the homepage.
//
// Vite's dynamic import() pulls each locale into its own code-split chunk
// (locale-ms-<hash>.js, locale-zh-<hash>.js) loaded only when the user
// switches language for the first time.
const LAZY_LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<{ default: Record<string, unknown> }>> = {
  ms: () => import('../locales/ms.json'),
  zh: () => import('../locales/zh.json'),
}

export const SUPPORTED = [
  { code: 'en', label: 'English' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'zh', label: '中文' },
] as const
export type Locale = typeof SUPPORTED[number]['code']

const STORAGE_KEY = 'dnj.locale'

function detectInitial(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'ms' || saved === 'zh') return saved
  } catch { /* tolerate */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase()
  if (nav.startsWith('zh')) return 'zh'
  if (nav.startsWith('ms') || nav.startsWith('id')) return 'ms'
  return 'en'
}

const initialLocale = detectInitial()

const loadedLocales = new Set<Locale>(['en'])

async function ensureLocaleLoaded(lng: Locale): Promise<void> {
  if (loadedLocales.has(lng)) return
  const loader = LAZY_LOADERS[lng as Exclude<Locale, 'en'>]
  if (!loader) return
  try {
    const mod = await loader()
    i18n.addResourceBundle(lng, 'translation', mod.default, true, true)
    loadedLocales.add(lng)
  } catch (e) {
    console.error(`[i18n] failed to load locale ${lng}:`, e)
    // fallback to en silently — i18next has fallbackLng='en'
  }
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      // ms and zh load lazily on first switch
    },
    lng: initialLocale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
  .then(async () => {
    document.documentElement.lang = initialLocale
    // If the user's persisted/detected locale is not English, eagerly fetch
    // its bundle now (still off the critical path because init() resolves
    // first). i18next will display English keys as a brief flash until the
    // bundle arrives — typically <100ms on a warm CDN.
    if (initialLocale !== 'en') {
      await ensureLocaleLoaded(initialLocale)
    }
  })

i18n.on('languageChanged', (lng) => {
  const code = lng as Locale
  document.documentElement.lang = code
  try { localStorage.setItem(STORAGE_KEY, code) } catch { /* tolerate */ }
  if (code !== 'en' && !loadedLocales.has(code)) {
    void ensureLocaleLoaded(code)
  }
})

export default i18n
