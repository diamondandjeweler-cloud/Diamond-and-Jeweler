import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enTranslations from '../locales/en.json'
import msTranslations from '../locales/ms.json'
import zhTranslations from '../locales/zh.json'

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

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      ms: { translation: msTranslations },
      zh: { translation: zhTranslations },
    },
    lng: initialLocale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
  .then(() => {
    document.documentElement.lang = initialLocale
  })

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  try { localStorage.setItem(STORAGE_KEY, lng) } catch { /* tolerate */ }
})

export default i18n
