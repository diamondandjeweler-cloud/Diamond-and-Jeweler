import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { Button, Input, Alert, PageHeader } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'

export default function HMAccount() {
  useSeo({ title: 'Account', noindex: true })
  const { session, profile, refresh } = useSession()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!session) return
    const trimmed = fullName.trim()
    if (!trimmed) { setErr('Name cannot be empty.'); return }
    setBusy(true); setSaved(false); setErr(null)
    try {
      const { error } = await supabase.from('profiles').update({ full_name: trimmed }).eq('id', session.user.id)
      if (error) throw error
      await refresh()
      setSaved(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="Account" description="Manage your personal account details." />
      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-500 mb-1">Email address</label>
            <p className="text-sm text-ink-900 px-3 py-2 bg-ink-50 border border-ink-200 rounded-lg">
              {session?.user.email}
            </p>
          </div>
          <Input
            label="Display name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        {err && <Alert tone="red">{err}</Alert>}
        {saved && <Alert tone="green">Account updated.</Alert>}

        <Button onClick={() => void save()} loading={busy}>
          Save changes
        </Button>

        <div className="border-t border-ink-200 pt-4">
          <h2 className="text-sm font-semibold text-ink-700 mb-2">Password</h2>
          <p className="text-sm text-ink-500 mb-3">
            Request a password reset link to be sent to your email address.
          </p>
          <Link to="/password-reset" className="text-sm text-brand-600 hover:text-brand-700 underline">
            Reset password
          </Link>
        </div>
      </div>
    </div>
  )
}
