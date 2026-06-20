import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { supabase, siteUrl } from '../../lib/supabase'
import AuthShell from '../../components/AuthShell'
import { Button, Input, Alert } from '../../components/ui'
import Turnstile from '../../components/Turnstile'
import { useSeo } from '../../lib/useSeo'

export default function PasswordReset() {
  const { t } = useTranslation()
  useSeo({
    title: t('passwordReset.seoTitle'),
    description: t('passwordReset.seoDescription'),
  })
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!captchaToken) { setErr(t('passwordReset.errorCaptcha')); return }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?type=recovery`,
      captchaToken,
    })
    setBusy(false)
    if (error) { setErr(error.message); setCaptchaToken(null); return }
    setSent(true)
  }

  return (
    <AuthShell
      title={sent ? t('passwordReset.sentTitle') : t('passwordReset.title')}
      subtitle={sent ? undefined : t('passwordReset.subtitle')}
      footer={<Link to="/login" className="font-medium text-brand-700 hover:text-brand-800">{t('auth.backToSignIn')}</Link>}
    >
      {sent ? (
        <Alert tone="green" title={t('passwordReset.sentAlertTitle')}>
          <Trans
            i18nKey="passwordReset.sentBody"
            values={{ email }}
            components={{ strong: <strong /> }}
          />
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label={t('common.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Turnstile onToken={setCaptchaToken} />
          {err && <Alert tone="red">{err}</Alert>}
          <Button type="submit" loading={busy} className="w-full" size="lg" disabled={!captchaToken}>
            {busy ? t('passwordReset.sending') : t('passwordReset.submit')}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
