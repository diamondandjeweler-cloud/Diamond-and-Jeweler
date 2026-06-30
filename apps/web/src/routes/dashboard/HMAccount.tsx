import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { updateProfile } from '../../data/repositories/profiles'
import { Button, Input, Alert, PageHeader } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'

export default function HMAccount() {
  const { t } = useTranslation()
  useSeo({ title: t('hmAccount.seoTitle', 'Account'), noindex: true })
  const { session, profile, refresh } = useSession()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!session) return
    const trimmed = fullName.trim()
    if (!trimmed) { setErr(t('hmAccount.nameEmpty', 'Name cannot be empty.')); return }
    setBusy(true); setSaved(false); setErr(null)
    try {
      const { error } = await updateProfile(session.user.id, { full_name: trimmed })
      if (error) throw error
      await refresh()
      setSaved(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('hmAccount.saveFailed', 'Save failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title={t('hmAccount.title', 'Account')} description={t('hmAccount.description', 'Manage your personal account details.')} />
      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <p className="block text-sm font-medium text-ink-500 dark:text-gray-400 mb-1">{t('hmAccount.emailLabel', 'Email address')}</p>
            <p className="text-sm text-ink-900 dark:text-white px-3 py-2 bg-ink-50 dark:bg-gray-800 border border-ink-200 dark:border-gray-700 rounded-lg">
              {session?.user.email}
            </p>
          </div>
          <Input
            label={t('hmAccount.displayNameLabel', 'Display name')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        {err && <Alert tone="red">{err}</Alert>}
        {saved && <Alert tone="green">{t('hmAccount.updatedMsg', 'Account updated.')}</Alert>}

        <Button onClick={() => void save()} loading={busy}>
          {t('hmAccount.saveButton', 'Save changes')}
        </Button>

        <div className="border-t border-ink-200 dark:border-gray-700 pt-4">
          <h2 className="text-sm font-semibold text-ink-700 dark:text-gray-300 mb-2">{t('hmAccount.passwordHeading', 'Password')}</h2>
          <p className="text-sm text-ink-500 dark:text-gray-400 mb-3">
            {t('hmAccount.passwordHelp', 'Request a password reset link to be sent to your email address.')}
          </p>
          <Link to="/password-reset" className="text-sm text-brand-600 hover:text-brand-700 underline">
            {t('hmAccount.resetPassword', 'Reset password')}
          </Link>
        </div>
      </div>
    </div>
  )
}
