import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const STORAGE_KEY = 'dnj_storage_ack'

export default function CookieBanner() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
    } catch {
      // Private browsing — silently skip
    }
  }, [])

  function acknowledge() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label={t('cookieBanner.ariaLabel')}
      className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 shadow-lg"
    >
      <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex-1 text-sm text-gray-700">
          <p className="font-semibold mb-1">{t('cookieBanner.title')}</p>
          <p>{t('cookieBanner.body')}</p>
          <ul className="mt-1 list-disc ml-4 space-y-0.5 text-xs text-gray-500">
            <li>{t('cookieBanner.item1')}</li>
            <li>{t('cookieBanner.item2')}</li>
            <li>{t('cookieBanner.item3')}</li>
            <li>{t('cookieBanner.item4')}</li>
          </ul>
          <p className="mt-1 text-xs text-gray-500">
            {t('cookieBanner.learnMore')}{' '}
            <a href="/privacy" className="underline text-brand-600" target="_blank" rel="noopener">
              {t('cookieBanner.privacyLink')}
            </a>.
          </p>
        </div>
        <button
          onClick={acknowledge}
          className="shrink-0 px-4 py-2 rounded-lg bg-ink-900 text-white text-sm font-medium
                     hover:bg-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition"
        >
          {t('cookieBanner.ok')}
        </button>
      </div>
    </div>
  )
}
