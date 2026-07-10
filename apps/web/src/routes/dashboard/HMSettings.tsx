import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { updateProfile } from '../../data/repositories/profiles'
import { Button, Alert, PageHeader } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'

export default function HMSettings() {
  const { t } = useTranslation()
  useSeo({ title: t('hmSettings.seoTitle', 'Settings'), noindex: true })
  const { session, profile, refresh } = useSession(useShallow((s) => ({ session: s.session, profile: s.profile, refresh: s.refresh })))
  const userId = session?.user.id

  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [whatsappOptIn, setWhatsappOptIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setWhatsappNumber(profile.whatsapp_number ?? '')
      setWhatsappOptIn(profile.whatsapp_opt_in ?? false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function save() {
    if (!userId) return
    const trimmed = whatsappNumber.trim()
    if (trimmed && !/^\+?[0-9\s\-()]{7,20}$/.test(trimmed)) {
      setErr(t('hmSettings.invalidPhone', 'Phone number contains invalid characters. Use digits, spaces, + or hyphens only (e.g. +60 12 345 6789).'))
      return
    }
    setBusy(true); setSaved(false); setErr(null)
    try {
      const { error } = await updateProfile(userId, {
        whatsapp_number: trimmed || null,
        whatsapp_opt_in: whatsappOptIn && !!trimmed,
      })
      if (error) throw error
      await refresh()
      setSaved(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('hmSettings.saveFailed', 'Save failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title={t('hmSettings.title', 'Settings')} description={t('hmSettings.description', 'Notification and contact preferences.')} />
      <div className="space-y-6">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-ink-700 dark:text-fg-strong uppercase tracking-wide">{t('hmSettings.whatsappHeading', 'WhatsApp notifications')}</h2>
          <div>
            <label htmlFor="hm-whatsapp-number" className="block text-sm font-medium text-ink-700 dark:text-fg-strong mb-1">{t('hmSettings.whatsappNumberLabel', 'WhatsApp number')}</label>
            <input
              id="hm-whatsapp-number"
              type="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="+60 12 345 6789"
              className="w-full border border-border dark:bg-surface dark:text-fg rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={whatsappOptIn}
              onChange={(e) => setWhatsappOptIn(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-ink-700 dark:text-fg-strong">
              {t('hmSettings.optInLabel', 'Send me WhatsApp notifications for new candidate matches, interview updates, and important alerts.')}
            </span>
          </label>
        </div>

        {err && <Alert tone="red">{err}</Alert>}
        {saved && <Alert tone="green">{t('hmSettings.savedMsg', 'Settings saved.')}</Alert>}

        <Button onClick={() => void save()} loading={busy}>
          {t('hmSettings.saveButton', 'Save settings')}
        </Button>
      </div>
    </div>
  )
}
