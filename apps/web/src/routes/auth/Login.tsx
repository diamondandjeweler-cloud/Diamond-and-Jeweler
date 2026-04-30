import { useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { supabase, siteUrl } from '../../lib/supabase'
import AuthShell from '../../components/AuthShell'
import { Button, Input, PasswordInput, Alert } from '../../components/ui'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const isHiring = params.get('role') === 'hr_admin'
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/home'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleGoogleSignIn() {
    setErr(null)
    setBusy(true)
    if (isHiring) {
      try { localStorage.setItem('dnj.signup_role', 'hr_admin') } catch { /* tolerate */ }
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteUrl}/auth/callback` },
    })
    if (error) { setErr(error.message); setBusy(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    const timeout = new Promise<{ error: { message: string } }>(resolve =>
      setTimeout(() => resolve({ error: { message: 'Sign-in timed out — please refresh the page and try again.' } }), 15000)
    )
    const { error } = await Promise.race([
      supabase.auth.signInWithPassword({ email, password }),
      timeout,
    ])
    setBusy(false)
    if (error) { setErr(error.message); return }
    navigate(redirectTo, { replace: true })
  }

  return (
    <AuthShell
      variant={isHiring ? 'hiring' : 'talent'}
      title="Welcome back"
      subtitle={isHiring ? 'Sign in to your company account.' : 'Sign in to continue to your matches.'}
      footer={
        isHiring
          ? <>New here? <Link to="/signup?role=hr_admin" className="font-medium" style={{ color: '#3b82f6' }}>Create a company account</Link></>
          : <>New here? <Link to="/signup" className="font-medium text-brand-700 hover:text-brand-800">Create an account</Link></>
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
          Continue with Google
        </button>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-ink-200" />
          <span className="text-xs text-ink-400">or sign in with email</span>
          <div className="flex-1 border-t border-ink-200" />
        </div>

        <form onSubmit={handleSubmit} method="post" className="space-y-4">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          {err && <Alert tone="red">{err}</Alert>}
          <Button type="submit" loading={busy} className="w-full" size="lg">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <div className="text-center text-sm">
            <Link to="/password-reset" className="text-ink-500 hover:text-ink-800">Forgot password?</Link>
          </div>
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
