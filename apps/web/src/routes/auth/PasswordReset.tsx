import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, siteUrl } from '../../lib/supabase'
import AuthShell from '../../components/AuthShell'
import { Button, Input, Alert } from '../../components/ui'

export default function PasswordReset() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?type=recovery`,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setSent(true)
  }

  return (
    <AuthShell
      title={sent ? 'Check your inbox' : 'Reset your password'}
      subtitle={sent ? undefined : "We'll email you a link to set a new one."}
      footer={<Link to="/login" className="font-medium text-brand-700 hover:text-brand-800">Back to sign in</Link>}
    >
      {sent ? (
        <Alert tone="green" title="Email sent">
          If an account exists for <strong>{email}</strong>, we've sent a password reset link.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          {err && <Alert tone="red">{err}</Alert>}
          <Button type="submit" loading={busy} className="w-full" size="lg">
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
