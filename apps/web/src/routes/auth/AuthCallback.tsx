import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

/**
 * Handles three scenarios:
 *  - /auth/callback?type=signup  (shown after signUp; email pending confirmation)
 *  - /auth/callback?type=recovery (user clicked password-reset link)
 *  - /auth/callback (generic magic-link / OAuth / invite callback)
 *
 * Supabase parses the URL fragment automatically (detectSessionInUrl: true).
 * We just need to react once the session resolves.
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const type = params.get('type')
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState<'waiting' | 'recover' | 'done'>('waiting')

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

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (data.session) {
        if (type === 'recovery') setMode('recover')
        else {
          void applyStoredRole(data.session.user.id).then(() => navigate('/home', { replace: true }))
        }
      } else {
        setMode('waiting')
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      if (!session) return
      if (type === 'recovery') setMode('recover')
      else {
        void applyStoredRole(session.user.id).then(() => navigate('/home', { replace: true }))
      }
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [navigate, type])

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

  // waiting — e.g. after signup
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
