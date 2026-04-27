import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, siteUrl } from '../../lib/supabase'
import Consent from '../../components/Consent'
import AuthShell from '../../components/AuthShell'
import { Button, Input, PasswordInput, Alert } from '../../components/ui'

export default function SignUp() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const referralCode = (params.get('ref') ?? '').toUpperCase().slice(0, 16)
  const role = (params.get('role') === 'hr_admin' ? 'hr_admin' : 'talent') as 'talent' | 'hr_admin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [consents, setConsents] = useState({ dob: false, market: false, tos: false })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canSubmit =
    email.length > 3 && password.length >= 8 && fullName.length > 1
    && consents.dob && consents.tos

  async function handleGoogleSignUp() {
    setErr(null)
    setBusy(true)
    try {
      localStorage.setItem('dnj.signup_role', role)
      if (referralCode) localStorage.setItem('bole.referral_code', referralCode)
    } catch { /* tolerate */ }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteUrl}/auth/callback` },
    })
    if (error) { setErr(error.message); setBusy(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!canSubmit) { setErr('Please complete all required fields and consents.'); return }
    setBusy(true)
    if (referralCode) {
      try { localStorage.setItem('bole.referral_code', referralCode) } catch { /* tolerate */ }
    }

    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
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
    setBusy(false)
    if (error) { setErr(error.message); return }
    navigate('/auth/callback?type=signup', { replace: true })
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle={role === 'talent' ? "Find your next role through curated matches." : "Hiring managers are added by invitation from their HR contact."}
      footer={
        <>Already have an account? <Link to="/login" className="font-medium text-brand-700 hover:text-brand-800">Sign in</Link></>
      }
    >
      <div className="space-y-4">
        {referralCode && (
          <div className="rounded-lg bg-brand-50 border border-brand-200 px-3 py-2 text-xs text-brand-800">
            Referred by code <span className="font-mono font-semibold">{referralCode}</span> — your friend earns points when you finish onboarding.
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignUp}
          disabled={busy}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-ink-200 bg-white text-ink-800 text-sm font-medium hover:bg-ink-50 hover:border-ink-300 transition-all shadow-soft disabled:opacity-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p className="text-center text-[11px] text-ink-400 leading-relaxed -mt-1">
          By continuing, you agree to our{' '}
          <Link to="/terms" className="underline hover:text-ink-700">Terms</Link> and consent to AI-powered compatibility analysis of your data.
        </p>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-ink-200" />
          <span className="text-xs text-ink-400">or sign up with email</span>
          <div className="flex-1 border-t border-ink-200" />
        </div>

        <form onSubmit={handleSubmit} method="post" className="space-y-4">
          <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <PasswordInput label="Password" hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />

          <div className="space-y-3 pt-4 border-t border-ink-100">
            <div className="text-xs text-ink-500 uppercase tracking-wide font-medium">Consents</div>
            <Consent
              checked={consents.dob}
              onChange={(v) => setConsents((c) => ({ ...c, dob: v }))}
              label="I consent to DNJ collecting my personal data to power advanced AI-driven compatibility analysis. All data is fully encrypted and never disclosed to employers."
              required
            />
            <Consent
              checked={consents.market}
              onChange={(v) => setConsents((c) => ({ ...c, market: v }))}
              label="I consent to anonymised comparison of my salary expectations against market data."
            />
            <Consent
              checked={consents.tos}
              onChange={(v) => setConsents((c) => ({ ...c, tos: v }))}
              label="I have read and agree to the Terms of Service and Privacy Notice."
              required
            />
          </div>

          {err && <Alert tone="red">{err}</Alert>}

          <Button type="submit" loading={busy} disabled={!canSubmit} className="w-full" size="lg">
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </div>
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
