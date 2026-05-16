import { useEffect, useRef, useState } from 'react'
import CookieBanner from '../../components/CookieBanner'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, siteUrl } from '../../lib/supabase'
import AuthShell from '../../components/AuthShell'
import { Button, Input, PasswordInput, Alert } from '../../components/ui'
import { markAdminVerified } from '../../lib/adminReauth'
import Turnstile from '../../components/Turnstile'
import { useSeo } from '../../lib/useSeo'
import { logAuthFailure } from '../../lib/authTelemetry'

export default function Login() {
  useSeo({
    title: 'Sign in',
    description: 'Sign in to your DNJ account to view your curated matches, manage your profile, or post new roles.',
  })
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const roleParam = params.get('role')
  const isHRAdmin = roleParam === 'hr_admin'
  const isHiringManager = roleParam === 'hiring_manager'
  const isHiring = isHRAdmin || isHiringManager
  const isReauth = params.get('reauth') === '1'
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/home'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  // Brute-force protection: track consecutive failures in sessionStorage.
  const LOCKOUT_KEY = 'dnj.login_fails'
  const LOCKOUT_MAX = 5
  const LOCKOUT_MS = 15 * 60 * 1000

  function getLockout(): { count: number; since: number } {
    try { return JSON.parse(sessionStorage.getItem(LOCKOUT_KEY) ?? '{}') } catch { return { count: 0, since: 0 } }
  }
  function isLockedOut(): boolean {
    const { count, since } = getLockout()
    if (count < LOCKOUT_MAX) return false
    return Date.now() - since < LOCKOUT_MS
  }
  function recordFailure() {
    const { count, since } = getLockout()
    const fresh = Date.now() - since > LOCKOUT_MS
    const next = fresh ? 1 : count + 1
    try { sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify({ count: next, since: fresh ? Date.now() : since })) } catch { /* tolerate */ }
  }
  function clearFailures() {
    try { sessionStorage.removeItem(LOCKOUT_KEY) } catch { /* tolerate */ }
  }
  function lockoutMinutesLeft(): number {
    const { since } = getLockout()
    return Math.ceil((LOCKOUT_MS - (Date.now() - since)) / 60000)
  }
  // Queue a submit when the user clicks before the Turnstile token has
  // arrived. Without this, the click was either (a) suppressed by the
  // disabled-button race or (b) early-returned with a confusing "complete the
  // verification" error. We now show "verifying..." and submit automatically
  // once the token populates.
  const queuedRef = useRef(false)
  const [waitingForCaptcha, setWaitingForCaptcha] = useState(false)

  async function handleGoogleSignIn() {
    setErr(null)
    setBusy(true)
    // Clear any stale PKCE code-verifier from a previous failed attempt — if
    // it's left over, the Supabase callback will try to exchange a fresh
    // Google code against the wrong verifier and silently fail, leaving the
    // user stuck on "Signing you in…".
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.includes('code-verifier') || k.endsWith('-pkce')) localStorage.removeItem(k)
      })
    } catch { /* tolerate */ }
    if (isHRAdmin || isHiringManager) {
      try { localStorage.setItem('dnj.signup_role', isHRAdmin ? 'hr_admin' : 'hiring_manager') } catch { /* tolerate */ }
    }
    if (redirectTo && redirectTo !== '/home') {
      try { sessionStorage.setItem('dnj.auth_redirect', redirectTo) } catch { /* tolerate */ }
    }
    const roleQuery = isHRAdmin ? '?role=hr_admin' : isHiringManager ? '?role=hiring_manager' : ''
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteUrl}/auth/callback${roleQuery}` },
    })
    if (error) { setErr(error.message); setBusy(false) }
  }

  async function doSubmit(token: string) {
    setBusy(true)
    setWaitingForCaptcha(false)
    const timeout = new Promise<{ error: { message: string } }>(resolve =>
      setTimeout(() => resolve({ error: { message: t('auth.signInTimeout') } }), 15000)
    )
    const { error } = await Promise.race([
      supabase.auth.signInWithPassword({ email, password, options: { captchaToken: token } }),
      timeout,
    ])
    setBusy(false)
    if (error) {
      recordFailure()
      setErr(error.message)
      setCaptchaToken(null)
      logAuthFailure(email, error.message)
      return
    }
    clearFailures()
    markAdminVerified()
    navigate(redirectTo, { replace: true })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (isLockedOut()) {
      setErr(`Too many failed attempts. Please try again in ${lockoutMinutesLeft()} minute${lockoutMinutesLeft() === 1 ? '' : 's'}.`)
      return
    }
    if (!email || !password) { setErr('Please enter your email and password.'); return }
    if (!captchaToken) {
      // Token not in yet — queue submit instead of bouncing the user.
      queuedRef.current = true
      setWaitingForCaptcha(true)
      return
    }
    await doSubmit(captchaToken)
  }

  // When the Turnstile token arrives after the user clicked, fire the queued
  // submit. We also clear queue state on token expiry/error so the next click
  // works normally.
  useEffect(() => {
    if (captchaToken && queuedRef.current) {
      queuedRef.current = false
      void doSubmit(captchaToken)
    } else if (!captchaToken && waitingForCaptcha && !busy) {
      // Token cleared without a submit — drop the waiting state.
      // (Don't clear if we're mid-submit; doSubmit handles its own busy flag.)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captchaToken])

  return (
    <>
    <CookieBanner />
    <AuthShell
      variant={isHiring ? 'hiring' : 'talent'}
      title={isReauth ? t('auth.reauthTitle') : t('auth.welcomeBack')}
      subtitle={
        isReauth ? t('auth.reauthSubtitle')
        : isHRAdmin ? t('auth.hrSubtitle')
        : isHiringManager ? t('auth.hmSubtitle')
        : t('auth.talentSubtitle')
      }
      footer={
        isHRAdmin
          ? <>{t('auth.newHere')} <Link to="/signup?role=hr_admin" className="font-medium" style={{ color: '#3b82f6' }}>{t('auth.createCompany')}</Link></>
          : isHiringManager
            ? <>{t('auth.newHere')} <Link to="/signup?role=hiring_manager" className="font-medium" style={{ color: '#3b82f6' }}>{t('auth.createHm')}</Link></>
            : <>{t('auth.newHere')} <Link to="/signup" className="font-medium text-brand-700 hover:text-brand-800">{t('auth.createTalent')}</Link></>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-ink-200 bg-white text-ink-800 text-sm font-medium hover:bg-ink-50 hover:border-ink-300 transition-all shadow-soft disabled:opacity-50"
        >
          <GoogleIcon />
          {t('auth.continueWithGoogle')}
        </button>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-ink-200" />
          <span className="text-xs text-ink-400">{t('auth.orSignInEmail')}</span>
          <div className="flex-1 border-t border-ink-200" />
        </div>

        <form onSubmit={handleSubmit} method="post" className="space-y-4">
          <Input label={t('common.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <PasswordInput label={t('common.password')} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <Turnstile onToken={setCaptchaToken} />
          {err && <Alert tone="red">{err}</Alert>}
          {waitingForCaptcha && !err && (
            <Alert tone="amber">{t('auth.verifyingHuman')}</Alert>
          )}
          <Button type="submit" loading={busy || waitingForCaptcha} className="w-full" size="lg">
            {busy ? t('auth.signingIn') : waitingForCaptcha ? t('auth.verifyingHuman') : t('common.signIn')}
          </Button>
          <div className="text-center text-sm">
            <Link to="/password-reset" className="text-ink-500 hover:text-ink-800">{t('auth.forgotPassword')}</Link>
          </div>
        </form>
      </div>
    </AuthShell>
    </>
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
