import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import AuthShell from '../../components/AuthShell'
import { Button, Input, Alert } from '../../components/ui'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

interface EnrollData {
  id: string
  qrCode: string
  secret: string
}

export default function MfaEnroll() {
  useDocumentTitle('Set up two-factor authentication')
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [enroll, setEnroll] = useState<EnrollData | null>(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'qr' | 'verify'>('qr')

  useEffect(() => {
    let cancelled = false
    async function start() {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'DNJ Recruitment', friendlyName: 'Authenticator' })
      if (cancelled) return
      if (error) { setErr(error.message); return }
      setEnroll({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      })
      setStep('qr')
    }
    void start()
    return () => { cancelled = true }
  }, [])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!enroll) return
    setErr(null)
    setBusy(true)
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: enroll.id })
    if (challengeErr) { setErr(challengeErr.message); setBusy(false); return }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: enroll.id,
      challengeId: challengeData.id,
      code: code.replace(/\s/g, ''),
    })
    setBusy(false)
    if (verifyErr) { setErr(verifyErr.message); setCode(''); return }
    navigate('/admin', { replace: true })
  }

  return (
    <AuthShell variant="hiring" title={t('mfa.enrollTitle')} subtitle={t('mfa.enrollSubtitle')}>
      {err && <div className="mb-4"><Alert tone="red">{err}</Alert></div>}

      {step === 'qr' && enroll && (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">{t('mfa.scanInstruction')}</p>
          <div className="flex justify-center">
            <img src={enroll.qrCode} alt="TOTP QR code" className="w-48 h-48 rounded-lg border border-gray-200" />
          </div>
          <details className="text-xs text-ink-500">
            <summary className="cursor-pointer select-none">{t('mfa.manualEntry')}</summary>
            <code className="block mt-1 break-all font-mono bg-gray-50 rounded p-2">{enroll.secret}</code>
          </details>
          <Button className="w-full" size="lg" onClick={() => setStep('verify')}>
            {t('mfa.nextVerify')}
          </Button>
        </div>
      )}

      {step === 'verify' && (
        <form onSubmit={handleVerify} className="space-y-4">
          <p className="text-sm text-ink-600">{t('mfa.verifyInstruction')}</p>
          <Input
            label={t('mfa.codeLabel')}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            required
          />
          <Button type="submit" loading={busy} disabled={code.replace(/\s/g,'').length !== 6} className="w-full" size="lg">
            {t('mfa.verifyButton')}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
