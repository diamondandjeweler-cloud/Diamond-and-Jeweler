import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../lib/useSeo'

export default function NotFound() {
  const { t } = useTranslation()
  useSeo({ title: t('notFound.title'), noindex: true })
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-ink-50">
      <div className="max-w-md text-center">
        <div className="font-display text-8xl text-ink-200 mb-4" aria-hidden="true">404</div>
        <h1 className="font-display text-2xl text-ink-900 mb-2">{t('notFound.title')}</h1>
        <p className="text-ink-500 mb-6">
          {t('notFound.body')}
        </p>
        <Link to="/" className="btn-primary">{t('notFound.backHome')}</Link>
      </div>
    </div>
  )
}
