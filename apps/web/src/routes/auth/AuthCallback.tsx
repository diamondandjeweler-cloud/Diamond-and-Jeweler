import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

/**
 * Handles three scenarios:
 *  - /auth/callback?code=...      (PKCE OAuth — Google etc; exchange in progress)
 *  - /auth/callback?type=signup   (shown after signUp; email pending confirmation)
 *  - /auth/callback?type=recovery (user clicked password-reset link)
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const type = params.get('type')
  const hasCode = !!params.get('code')
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Start in 'loading' when a PKCE code is present — the exchange takes ~1s.
  // Only start in 'waiting' (show "Check your email") for explicit signup callbacks.
  const [mode, setMode] = useState<'loading' | 'waiting' | 'recover' | 'done'>(
    hasCode ? 'loading' : 'waiting'
  )

  useEffect(() => {
    let mounted = true

    async function applyStoredRole(userId: string) {
      try {
        const storedRole = localStorage.getItem('dnj.signup_role')
        if (!storedRole) return
        localStorage.removeItem('dnj.signup_role')
        const { data: existing } = await supabase.from('profiles').select('role').eq('id', userId).single()
        if (!existing?.role) {
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

    function handleSession(session: { user: { id: string } } | null) {
      if (!mounted) return
      if (session) {
        if (type === 'recovery') {
          setMode('recover')
        } else {
          void Promise.all([
            applyStoredRole(session.user.id),
            processStoredReferral(session.user.id),
          ]).then(() => { if (mounted) navigate('/home', { replace: true }) })
        }
      } else if (!hasCode) {
        // No code in URL and no session = genuine "check your email" case
        setMode('waiting')
      }
      // If hasCode but no session yet: exchange still in progress — stay in 'loading'
    }

    // Check if session is already available (may be null if PKCE exchange is still running)
    supabase.auth.getSession().then(({ data }) => handleSession(data.session))

    // onAuthStateChange fires once the PKCE exchange or token confirmation completes
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      handleSession(session)
    })

    // Safety net: if still loading after 15s, show an error
    const timeout = setTimeout(() => {
      if (mounted && mode === 'loading') setMode('waiting')
    }, 15000)

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate, type, hasCode]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // waiting — signup email confirmation
  return (
    <CenteredBox>
      <h1 className="text-xl font-semibold mb-2">Check your email</h1>
      <p className="text-gray-600 text-sm mb-4">
        We've sent you a confirmation link. Open it on this device to finish
        signing in.
      </p>
      <Link to="/login" className="text-brand-600 underline text-sm">Back to sign in</Link>
    </CenteredBox>
  )
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
