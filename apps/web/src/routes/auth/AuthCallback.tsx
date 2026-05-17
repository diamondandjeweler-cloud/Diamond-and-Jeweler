import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../state/useSession'
import { markAdminVerified } from '../../lib/adminReauth'

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
  const [params] = useSearchParams()
  const type = params.get('type')
  const hasCode = !!params.get('code')
  const roleParam = params.get('role')
  const { session } = useSession()
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)
  // Expired / already-used magic links arrive with the failure in the URL HASH
  // (#error=...&error_code=...). useSearchParams() only sees the query string,
  // so without this the user silently falls through to the "Check your email"
  // waiting screen — a dead end. Read the hash up front, route straight to the
  // error screen.
  const hashErr = readHashAuthError()
  const [err, setErr] = useState<string | null>(
    hashErr
      ? (/expired|invalid/i.test(`${hashErr.code} ${hashErr.description}`)
          ? 'This confirmation link has expired or has already been used.'
          : hashErr.description || 'This link could not be used.')
      : null
  )
  const [resent, setResent] = useState(false)
  const navigated = useRef(false)
  const [mode, setMode] = useState<'loading' | 'waiting' | 'recover' | 'done' | 'error'>(
    hashErr ? 'error' : hasCode ? 'loading' : 'waiting'
  )

  // Strip the error hash so a refresh doesn't replay it and the URL bar is
  // clean. Only runs for error hashes — a success hash (#access_token=...) is
  // left intact for supabase-js detectSessionInUrl to consume.
  useEffect(() => {
    if (typeof window !== 'undefined' && readHashAuthError()) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    if (type === 'recovery') {
      // Don't downgrade from 'done' (or back to 'recover' if already there) when
      // session re-fires due to USER_UPDATED after password change. Otherwise the
      // post-success transition (recover → done → /home) gets clobbered and the
      // user appears stuck on "Updating…".
      setMode((m) => (m === 'done' || m === 'recover' ? m : 'recover'))
      return
    }
    if (navigated.current) return
    navigated.current = true
    markAdminVerified()
    // Await the role update before navigating — otherwise window.location.replace
    // tears down the JS context mid-flight and the new page reads the still-default
    // role='talent' from the trigger, sending hiring signups to talent onboarding.
    // Referrals are best-effort and can fire-and-forget.
    ;(async () => {
      // Race applyStoredRole against 5s — a hung profiles query must not
      // block the redirect indefinitely (common for HM users on slow networks).
      await Promise.race([
        applyStoredRole(session.user.id),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ])
      void processStoredReferral(session.user.id)
      const savedRedirect = sessionStorage.getItem('dnj.auth_redirect') ?? '/home'
      try { sessionStorage.removeItem('dnj.auth_redirect') } catch { /* tolerate */ }
      window.location.replace(savedRedirect)
    })()
  }, [session, type])

  // Safety net: if PKCE doesn't deliver a session within 10s, treat it as a
  // failed OAuth exchange and show a real error — NOT the "Check your email"
  // screen, which is for email-signup confirmation and was misleading users
  // into clicking "Back to sign in" → /login (talent variant, default).
  // Verifies via supabase.auth.getSession() directly to rule out a Zustand
  // propagation lag before declaring failure. 10s (was 6s) tolerates slow
  // mobile networks where the PKCE round-trip legitimately takes >6s.
  useEffect(() => {
    if (!hasCode) return
    const timeout = setTimeout(async () => {
      if (navigated.current) return
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          // Session exists but Zustand never received it (onAuthStateChange fired
          // with null before the PKCE exchange completed, then never re-fired).
          // Push the session in directly so the main useEffect can fire.
          useSession.setState({ session: data.session, loading: false })
          return
        }
      } catch { /* fall through to error */ }
      console.error('[auth] PKCE exchange did not produce a session within 10s — likely stale code_verifier or expired code')
      // Clear stale PKCE state so the next attempt starts clean.
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.includes('code-verifier') || k.endsWith('-pkce')) localStorage.removeItem(k)
        })
      } catch { /* tolerate */ }
      setMode((m) => (m === 'loading' ? 'error' : m))
      setErr('We couldn\'t complete sign-in. Please try again.')
    }, 10000)
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

    // Hard 12s ceiling: if updateUser ever hangs (USER_UPDATED race, edge
    // network blip, etc.) we MUST release the busy state so the user isn't
    // staring at "Updating…" forever. The actual server-side password update
    // is idempotent — if it succeeded, retrying or re-sign-in works.
    let timedOut = false
    const ceiling = setTimeout(() => {
      timedOut = true
      setBusy(false)
      setErr('That took longer than expected. Try signing in with your new password — it may have already been saved.')
    }, 12000)

    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      clearTimeout(ceiling)
      if (timedOut) return
      setBusy(false)
      if (error) { setErr(error.message); return }
      markAdminVerified()
      setMode('done')
      // Use window.location so any pending in-flight session refresh
      // resolves cleanly under the new origin context, avoiding a stale-state
      // loop where the recovery callback URL is still in history.
      setTimeout(() => { window.location.replace('/home') }, 1200)
    } catch (e) {
      clearTimeout(ceiling)
      if (timedOut) return
      setBusy(false)
      setErr(e instanceof Error ? e.message : 'Could not update password. Please try again.')
    }
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
            placeholder="New password (min. 12 chars)"
            minLength={12}
            required
            className="w-full border rounded px-3 py-2"
            autoComplete="new-password"
          />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={busy || newPw.length < 12}
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

  if (mode === 'error') {
    // Two ways into error mode: a failed PKCE OAuth exchange, or an expired /
    // already-used magic link surfaced from the URL hash. Tailor copy + action.
    const isLinkExpiry = !!err && /expired|already been used/i.test(err)
    const retryHref = roleParam === 'hr_admin' ? '/login?role=hr_admin'
      : roleParam === 'hiring_manager' ? '/login?role=hiring_manager'
      : '/login'
    const signupHref = roleParam === 'hr_admin' ? '/signup?role=hr_admin'
      : roleParam === 'hiring_manager' ? '/signup?role=hiring_manager'
      : '/signup'
    return (
      <CenteredBox>
        <h1 className="text-xl font-semibold mb-2">
          {isLinkExpiry ? 'This link has expired' : "Sign-in didn't go through"}
        </h1>
        <p className="text-gray-600 text-sm mb-5">
          {err ?? 'We couldn\'t complete sign-in. Please try again.'}
          {isLinkExpiry && ' Sign up again with the same email and we\'ll send a fresh confirmation link.'}
        </p>
        <Link
          to={isLinkExpiry ? signupHref : retryHref}
          className="inline-block w-full py-2 rounded bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
        >
          {isLinkExpiry ? 'Get a new confirmation link' : 'Try sign-in again'}
        </Link>
        {isLinkExpiry ? (
          <p className="text-gray-500 text-xs mt-4">
            Already confirmed? <Link to={retryHref} className="text-brand-600 underline">Sign in instead</Link>.
          </p>
        ) : (
          <p className="text-gray-400 text-xs mt-4">
            If this keeps happening, clear your browser cache for this site and retry.
          </p>
        )}
      </CenteredBox>
    )
  }

  const pendingEmail = sessionStorage.getItem('dnj.pending_email')
  const loginHref = roleParam === 'hr_admin' ? '/login?role=hr_admin' : roleParam === 'hiring_manager' ? '/login?role=hiring_manager' : '/login'

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

/**
 * Reads an auth error returned in the URL hash. Supabase delivers expired or
 * already-used magic-link failures as `#error=...&error_code=...` — the query
 * string is empty in that case, so useSearchParams() never catches them.
 * Returns null for success hashes (#access_token=...) and no-hash URLs.
 */
function readHashAuthError(): { code: string; description: string } | null {
  if (typeof window === 'undefined' || !window.location.hash) return null
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = p.get('error_code') ?? p.get('error')
  if (!code) return null
  return { code, description: (p.get('error_description') ?? '').replace(/\+/g, ' ') }
}

async function applyStoredRole(userId: string) {
  try {
    const storedRole = localStorage.getItem('dnj.signup_role')
    if (!storedRole) return
    const { data: existing } = await supabase.from('profiles').select('role').eq('id', userId).single()
    // Only override if the profile has no role or still has the trigger's default 'talent' role.
    // (The trigger always inserts 'talent' as default, so we must overwrite it for hr_admin signups.)
    if (!existing?.role || existing.role === 'talent') {
      const { error } = await supabase.from('profiles').update({ role: storedRole }).eq('id', userId)
      if (error) throw error
    }
    // Only clear the stored role on success — otherwise a transient network
    // error would silently strand the user on the wrong role.
    localStorage.removeItem('dnj.signup_role')
  } catch (e) {
    console.error('[auth] applyStoredRole failed', e)
  }
}

async function processStoredReferral(userId: string) {
  try {
    // Read from sessionStorage (current tab only). Fall back to localStorage
    // for users who began signup in a previous Claude/SignUp.tsx version that
    // wrote to localStorage — read once, then clear both.
    let code = sessionStorage.getItem('bole.referral_code')
    if (!code) code = localStorage.getItem('bole.referral_code')
    sessionStorage.removeItem('bole.referral_code')
    localStorage.removeItem('bole.referral_code')
    if (!code) return
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
