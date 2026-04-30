import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../state/useSession'

/**
 * Handles three scenarios:
 *  - /auth/callback?code=...      (PKCE OAuth — Google etc; exchange in progress)
 *  - /auth/callback?type=signup   (shown after signUp; email pending confirmation)
 *  - /auth/callback?type=recovery (user clicked password-reset link)
 *
 * Watches Zustand session state (set by bootstrapSession) rather than
 * registering its own onAuthStateChange listener. Registering a second
 * listener causes Supabase v2 to re-emit SIGNED_IN to all existing
 * subscribers, which triggers an infinite remount loop.
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const type = params.get('type')
  const hasCode = !!params.get('code')
  const isHiring = params.get('role') === 'hr_admin'
  const { session } = useSession()
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const navigated = useRef(false)
  const [mode, setMode] = useState<'loading' | 'waiting' | 'recover' | 'done'>(
    hasCode ? 'loading' : 'waiting'
  )

  useEffect(() => {
    if (!session) return
    if (type === 'recovery') {
      setMode('recover')
      return
    }
    if (navigated.current) return
    navigated.current = true
    void applyStoredRole(session.user.id)
    void processStoredReferral(session.user.id)
    window.location.replace('/home')
  }, [session, type])

  // Safety net: if still loading after 15s (e.g. PKCE exchange stalled),
  // drop to the "check your email" UI so the user isn't stuck on a spinner.
  useEffect(() => {
    if (!hasCode) return
    const timeout = setTimeout(() => {
      setMode((m) => (m === 'loading' ? 'waiting' : m))
    }, 15000)
    return () => clearTimeout(timeout)
  }, [hasCode])

  async function handleResend() {
    const email = sessionStorage.getItem('dnj.pending_email')
    if (!email) return
    setBusy(true)
    await supabase.auth.resend({ type: 'signup', email }).catch(() => null)
    setBusy(false)
    setResent(true)
  }

  async function handlePwSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMode('done')
    setTimeout(() => navigate('/home', { replace: true }), 1500)
  }

  if (mode === 'recover') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <form
          onSubmit={handlePwSubmit}
          className="max-w-md w-full bg-white border rounded-lg p-6 shadow-sm space-y-4"
        >
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New password (min. 8 chars)"
            minLength={8}
            required
            className="w-full border rounded px-3 py-2"
            autoComplete="new-password"
          />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={busy || newPw.length < 8}
            className="w-full bg-brand-600 text-white py-2 rounded hover:bg-brand-700 disabled:bg-gray-300"
          >
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    )
  }

  if (mode === 'done') {
    return (
      <CenteredBox>
        <h1 className="text-xl font-semibold mb-2">Password updated</h1>
        <p className="text-gray-600 text-sm">Redirecting you to your dashboard…</p>
      </CenteredBox>
    )
  }

  if (mode === 'loading') {
    return (
      <CenteredBox>
        <div className="flex justify-center mb-4">
          <svg className="animate-spin h-8 w-8 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
        <p className="text-gray-600 text-sm">Signing you in…</p>
      </CenteredBox>
    )
  }

  const pendingEmail = sessionStorage.getItem('dnj.pending_email')
  const loginHref = isHiring ? '/login?role=hr_admin' : '/login'

  // waiting — signup email confirmation
  return (
    <CenteredBox>
      <h1 className="text-xl font-semibold mb-2">Check your email</h1>
      <p className="text-gray-600 text-sm mb-1">
        We've sent a confirmation link to{' '}
        {pendingEmail ? <strong>{pendingEmail}</strong> : 'your email address'}.
        Open it on this device to finish signing in.
      </p>
      <p className="text-gray-400 text-xs mb-5">
        Can't find it? Check your spam or junk folder.
      </p>
      {pendingEmail && (
        <button
          onClick={handleResend}
          disabled={busy || resent}
          className="w-full mb-3 py-2 rounded border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {resent ? 'Confirmation email resent ✓' : busy ? 'Sending…' : 'Resend confirmation email'}
        </button>
      )}
      <Link to={loginHref} className="text-brand-600 underline text-sm">Back to sign in</Link>
    </CenteredBox>
  )
}

async function applyStoredRole(userId: string) {
  try {
    const storedRole = localStorage.getItem('dnj.signup_role')
    if (!storedRole) return
    localStorage.removeItem('dnj.signup_role')
    const { data: existing } = await supabase.from('profiles').select('role').eq('id', userId).single()
    // Only override if the profile has no role or still has the trigger's default 'talent' role.
    // (The trigger always inserts 'talent' as default, so we must overwrite it for hr_admin signups.)
    if (!existing?.role || existing.role === 'talent') {
      await supabase.from('profiles').update({ role: storedRole }).eq('id', userId)
    }
  } catch { /* tolerate */ }
}

async function processStoredReferral(userId: string) {
  try {
    const code = localStorage.getItem('bole.referral_code')
    if (!code) return
    localStorage.removeItem('bole.referral_code')
    const { data: authData } = await supabase.auth.getSession()
    const token = authData.session?.access_token
    if (!token) return
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-referral`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ referral_code: code, referred_user_id: userId }),
      },
    )
  } catch { /* best effort — never block onboarding */ }
}

function CenteredBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border rounded-lg p-6 shadow-sm text-center">
        {children}
      </div>
    </div>
  )
}
