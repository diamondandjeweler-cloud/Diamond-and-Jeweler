import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../state/useSession'
import AuthShell from '../../components/AuthShell'
import { Button, Input, Alert } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'

export default function MfaChallenge() {
  useSeo({ title: 'Two-factor authentication', noindex: true })
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/admin'
  const { profile } = useSession()

  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Non-admin users should never need TOTP — redirect them home
  useEffect(() => {
    if (profile && profile.role !== 'admin') navigate('/home', { replace: true })
  }, [profile, navigate])

  useEffect(() => {
    let cancelled = false
    async function loadFactor() {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (cancelled) return
      if (error) { setErr(error.message); return }
      const totp = data.totp.find(f => f.status === 'verified')
      if (!totp) {
        navigate('/mfa/enroll', { replace: true })
        return
      }
      setFactorId(totp.id)
    }
    void loadFactor()
    return () => { cancelled = true }
  }, [navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setErr(null)
    setBusy(true)
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Verification timed out. Please try again.')), 15000)
      )
      const { error } = await Promise.race([
        supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') }),
        timeout,
      ])
      if (error) { setErr(error.message); setCode(''); return }
      navigate(redirectTo, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell variant="hiring" title={t('mfa.challengeTitle')} subtitle={t('mfa.challengeSubtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {err && <Alert tone="red">{err}</Alert>}
        <Input
          label={t('mfa.codeLabel')}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          required
          // Single-purpose MFA challenge page; intentional focus on the OTP field.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <Button
          type="submit"
          loading={busy}
          disabled={code.replace(/\s/g, '').length !== 6}
          className="w-full"
          size="lg"
        >
          {t('mfa.verifyButton')}
        </Button>
      </form>
    </AuthShell>
  )
}
