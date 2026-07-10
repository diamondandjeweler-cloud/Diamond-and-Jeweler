import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../lib/useSeo'
import { Button } from '../components/ui'

export default function NotFound() {
  const { t } = useTranslation()
  useSeo({ title: t('notFound.title'), noindex: true })
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-ink-50">
      <div className="max-w-md text-center">
        <div className="font-display text-8xl text-ink-400 mb-4" aria-hidden="true">404</div>
        <h1 className="font-display text-2xl text-ink-900 mb-2">{t('notFound.title')}</h1>
        <p className="text-ink-500 mb-6">
          {t('notFound.body')}
        </p>
        <Button asChild variant="primary"><Link to="/">{t('notFound.backHome')}</Link></Button>
      </div>
    </div>
  )
}
