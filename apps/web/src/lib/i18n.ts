import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enTranslations from '../locales/en.json'

export const SUPPORTED = [
  { code: 'en', label: 'English' },
] as const
export type Locale = typeof SUPPORTED[number]['code']

void i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: enTranslations } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
  .then(() => {
    document.documentElement.lang = 'en'
  })

export default i18n
