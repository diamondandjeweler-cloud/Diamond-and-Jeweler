import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, siteUrl } from '../../lib/supabase'
import { updateProfile } from '../../data/repositories/profiles'
import Consent from '../../components/Consent'
import AuthShell from '../../components/AuthShell'
import { Button, Input, PasswordInput, Alert } from '../../components/ui'
import Turnstile from '../../components/Turnstile'
import { useSeo } from '../../lib/useSeo'
import { createLogger } from '../../lib/logger'

const log = createLogger('signup')

export default function SignUp() {
  const { t } = useTranslation()
  useSeo({
    title: t('signup.seoTitle'),
    description: t('signup.seoDescription'),
  })
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const referralCode = (params.get('ref') ?? '').toUpperCase().slice(0, 16)
  const roleParam = params.get('role')
  const role = (roleParam === 'hr_admin' ? 'hr_admin' : (roleParam === 'hiring_manager' || roleParam === 'hiring') ? 'hiring_manager' : 'talent') as 'talent' | 'hr_admin' | 'hiring_manager'
  const isHiring = role !== 'talent'
  const isHRAdmin = role === 'hr_admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [consents, setConsents] = useState({ dob: false, market: false, tos: false })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [showGoogleModal, setShowGoogleModal] = useState(false)

  // Password policy: minimum 12 chars, must include uppercase, lowercase, digit, and symbol.
  function passwordValid(pw: string): boolean {
    return pw.length >= 12
      && /[A-Z]/.test(pw)
      && /[a-z]/.test(pw)
      && /[0-9]/.test(pw)
      && /[^A-Za-z0-9]/.test(pw)
  }
  const pwOk = passwordValid(password)

  const canSubmit =
    email.length > 3 && pwOk && fullName.length > 1
    && consents.dob && consents.tos && !!captchaToken

  function getBlockReason(): string | null {
    if (fullName.length <= 1) return t('signup.errorFullName')
    if (email.length <= 3) return t('signup.errorEmail')
    if (!pwOk) return t('auth.passwordWeak')
    if (!consents.dob || !consents.tos) return t('signup.errorConsents')
    if (!captchaToken) return t('signup.errorCaptcha')
    return null
  }

  async function handleGoogleSignUp() {
    setErr(null)
    setBusy(true)
    // Clear any stale PKCE code-verifier from a previous failed attempt — if
    // it lingers, the next callback will exchange the new Google code against
    // the wrong verifier and silently fail (user stuck on "Signing you in…").
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.includes('code-verifier') || k.endsWith('-pkce')) localStorage.removeItem(k)
      })
    } catch { /* tolerate */ }
    try {
      localStorage.setItem('dnj.signup_role', role)
      // Use sessionStorage so the code lives only for the current tab/auth
      // round-trip and never lingers if the user abandons signup.
      if (referralCode) sessionStorage.setItem('bole.referral_code', referralCode)
    } catch { /* tolerate */ }
    const roleQuery = role === 'hr_admin' ? '?role=hr_admin' : role === 'hiring_manager' ? '?role=hiring_manager' : ''
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteUrl}/auth/callback${roleQuery}` },
    })
    if (error) {
      setErr(error.message)
      setBusy(false)
      // OAuth never started — drop the pending referral code so a later
      // unrelated signup on this tab can't accidentally claim it.
      try { sessionStorage.removeItem('bole.referral_code') } catch { /* tolerate */ }
    }
  }

  function handleGoogleButtonClick() {
    if (consents.dob && consents.tos) {
      handleGoogleSignUp()
    } else {
      setShowGoogleModal(true)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!canSubmit) { setErr(getBlockReason() ?? t('auth.errorBody')); return }
    setBusy(true)
    if (referralCode) {
      try { sessionStorage.setItem('bole.referral_code', referralCode) } catch { /* tolerate */ }
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback`,
          captchaToken: captchaToken ?? undefined,
          data: {
            full_name: fullName, role,
            referral_code: referralCode || undefined,
            consents: {
              dob: consents.dob, market: consents.market, tos: consents.tos,
              consented_at: new Date().toISOString(),
            },
          },
        },
      })
      if (error) {
        setErr(error.message)
        setCaptchaToken(null)
        try { sessionStorage.removeItem('bole.referral_code') } catch { /* tolerate */ }
        return
      }
      // Auto-confirm is on: signUp returns a session immediately for new users.
      // Skip the "check your email" screen and go straight to the app.
      if (data.session) {
        // The DB trigger creates the profile with role='talent' by default and
        // ignores the role from options.data, so for hiring signups we have to
        // overwrite it here before navigating. Awaited to avoid the same race
        // that AuthCallback hits.
        if (role !== 'talent') {
          try {
            await updateProfile(data.session.user.id, { role })
          } catch (e) {
            log.error('[signup] role update failed', e)
          }
        }
        window.location.replace('/home')
        return
      }
      // Email confirmation required (auto-confirm off, or email already registered).
      try { sessionStorage.setItem('dnj.pending_email', email) } catch { /* tolerate */ }
      const callbackRole = role !== 'talent' ? `&role=${role}` : ''
      navigate(`/auth/callback?type=signup${callbackRole}`, { replace: true })
    } catch {
      setErr(t('signup.networkError'))
      setCaptchaToken(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      variant={isHiring ? 'hiring' : 'talent'}
      title={
        isHRAdmin ? t('auth.createTitleHr')
        : role === 'hiring_manager' ? t('auth.createTitleHm')
        : t('auth.createTitleTalent')
      }
      subtitle={
        isHRAdmin ? t('auth.createSubtitleHr')
        : role === 'hiring_manager' ? t('auth.createSubtitleHm')
        : t('auth.createSubtitleTalent')
      }
      footer={
        <>{t('auth.haveAccount')}{' '}
          <Link
            to={isHRAdmin ? '/login?role=hr_admin' : role === 'hiring_manager' ? '/login?role=hiring_manager' : '/login'}
            className="font-medium hover:opacity-80 transition-opacity"
            style={{ color: isHiring ? '#1d4ed8' : '#8a6420' }}>
            {t('common.signIn')}
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {referralCode && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: isHiring ? 'rgba(59,130,246,0.08)' : 'rgba(201,168,76,0.08)',
              border: `1px solid ${isHiring ? 'rgba(59,130,246,0.25)' : 'rgba(201,168,76,0.25)'}`,
              color: isHiring ? '#1d4ed8' : '#8a6420',
            }}
          >
            {t('signup.referredByCode')}{' '}
            <span className="font-mono font-semibold">{referralCode}</span>
            {' '}{t('signup.referredByCodeTail')}
          </div>
        )}

        {/* Google button — primary CTA at the top */}
        <button
          type="button"
          onClick={handleGoogleButtonClick}
          disabled={busy}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            borderColor: 'rgba(0,0,0,0.12)',
            backgroundColor: '#fff',
            color: '#1a1a2e',
          }}
        >
          <GoogleIcon />
          {t('auth.continueWithGoogle')}
        </button>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-ink-200" />
          <span className="text-xs text-ink-500">{t('auth.orSignUpEmail')}</span>
          <div className="flex-1 border-t border-ink-200" />
        </div>

        <form onSubmit={handleSubmit} method="post" className="space-y-4">
          <Input
            label={t('common.fullName')}
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setErr(null) }}
            required
            minLength={2}
            autoComplete="name"
          />
          <Input
            label={t('common.email')}
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErr(null) }}
            required
            autoComplete="email"
          />
          <PasswordInput
            label={t('common.password')}
            hint={!password || pwOk ? t('auth.passwordHint') : t('auth.passwordWeak')}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setErr(null) }}
            required
            minLength={12}
            autoComplete="new-password"
          />

          <div className="space-y-3 pt-4 border-t border-ink-100">
            <div className="text-xs text-ink-500 uppercase tracking-widest font-semibold">
              {t('auth.consentsHeading')}
            </div>

            {isHRAdmin ? (
              <>
                <Consent
                  checked={consents.dob}
                  onChange={(v) => setConsents((c) => ({ ...c, dob: v }))}
                  label={t('signup.consentDataHr')}
                  required
                />
                <Consent
                  checked={consents.market}
                  onChange={(v) => setConsents((c) => ({ ...c, market: v }))}
                  label={t('signup.consentMarketHr')}
                />
                <Consent
                  checked={consents.tos}
                  onChange={(v) => setConsents((c) => ({ ...c, tos: v }))}
                  label={t('signup.consentTos')}
                  required
                />
              </>
            ) : role === 'hiring_manager' ? (
              <>
                <Consent
                  checked={consents.dob}
                  onChange={(v) => setConsents((c) => ({ ...c, dob: v }))}
                  label={t('signup.consentDataHm')}
                  required
                />
                <Consent
                  checked={consents.market}
                  onChange={(v) => setConsents((c) => ({ ...c, market: v }))}
                  label={t('signup.consentMarketHm')}
                />
                <Consent
                  checked={consents.tos}
                  onChange={(v) => setConsents((c) => ({ ...c, tos: v }))}
                  label={t('signup.consentTos')}
                  required
                />
              </>
            ) : (
              <>
                <Consent
                  checked={consents.dob}
                  onChange={(v) => setConsents((c) => ({ ...c, dob: v }))}
                  label={t('signup.consentDataTalent')}
                  required
                />
                <Consent
                  checked={consents.market}
                  onChange={(v) => setConsents((c) => ({ ...c, market: v }))}
                  label={t('signup.consentMarketTalent')}
                />
                <Consent
                  checked={consents.tos}
                  onChange={(v) => setConsents((c) => ({ ...c, tos: v }))}
                  label={t('signup.consentTos')}
                  required
                />
              </>
            )}
          </div>

          <Turnstile onToken={setCaptchaToken} />

          {err && <Alert tone="red">{err}</Alert>}

          <Button
            type="submit"
            loading={busy}
            className="w-full"
            size="lg"
          >
            {busy
              ? t('common.submitting')
              : isHRAdmin
                ? t('auth.createCompanyAccount')
                : role === 'hiring_manager'
                  ? t('auth.createHm')
                  : t('auth.createAccount')}
          </Button>
        </form>
      </div>

      {/* Consent gate modal — shown when user clicks Google without ticking required consents */}
      {showGoogleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) setShowGoogleModal(false); }}
          onKeyDown={(e) => e.key === 'Escape' && setShowGoogleModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="google-modal-title"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
          >
            <div>
              <h2 id="google-modal-title" className="text-base font-semibold text-ink-900">{t('signup.googleModalTitle')}</h2>
              <p className="text-xs text-ink-500 mt-1">{t('signup.googleModalSubtitle')}</p>
            </div>

            <div className="space-y-3">
              {isHRAdmin ? (
                <>
                  <Consent checked={consents.dob} onChange={(v) => setConsents((c) => ({ ...c, dob: v }))} label={t('signup.consentDataHr')} required />
                  <Consent checked={consents.market} onChange={(v) => setConsents((c) => ({ ...c, market: v }))} label={t('signup.consentMarketHr')} />
                  <Consent checked={consents.tos} onChange={(v) => setConsents((c) => ({ ...c, tos: v }))} label={t('signup.consentTos')} required />
                </>
              ) : role === 'hiring_manager' ? (
                <>
                  <Consent checked={consents.dob} onChange={(v) => setConsents((c) => ({ ...c, dob: v }))} label={t('signup.consentDataHm')} required />
                  <Consent checked={consents.market} onChange={(v) => setConsents((c) => ({ ...c, market: v }))} label={t('signup.consentMarketHm')} />
                  <Consent checked={consents.tos} onChange={(v) => setConsents((c) => ({ ...c, tos: v }))} label={t('signup.consentTos')} required />
                </>
              ) : (
                <>
                  <Consent checked={consents.dob} onChange={(v) => setConsents((c) => ({ ...c, dob: v }))} label={t('signup.consentDataTalent')} required />
                  <Consent checked={consents.market} onChange={(v) => setConsents((c) => ({ ...c, market: v }))} label={t('signup.consentMarketTalent')} />
                  <Consent checked={consents.tos} onChange={(v) => setConsents((c) => ({ ...c, tos: v }))} label={t('signup.consentTos')} required />
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowGoogleModal(false); handleGoogleSignUp() }}
                disabled={!consents.dob || !consents.tos || busy}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: 'rgba(0,0,0,0.12)', backgroundColor: '#fff', color: '#1a1a2e' }}
              >
                <GoogleIcon />
                {t('auth.continueWithGoogle')}
              </button>
              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                className="text-sm text-ink-500 hover:text-ink-700 text-center py-1 transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthShell>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
