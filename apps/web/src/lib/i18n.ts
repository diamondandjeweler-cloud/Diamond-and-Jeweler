import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import enTranslations from '../locales/en.json'
import msTranslations from '../locales/ms.json'
import zhTranslations from '../locales/zh.json'

export const SUPPORTED = [
  { code: 'en', label: 'English' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'zh', label: '中文' },
] as const
export type Locale = typeof SUPPORTED[number]['code']

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      ms: { translation: msTranslations },
      zh: { translation: zhTranslations },
    },
    fallbackLng: 'en',
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: { escapeValue: false },
  })
  .then(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
  })

export default i18n
