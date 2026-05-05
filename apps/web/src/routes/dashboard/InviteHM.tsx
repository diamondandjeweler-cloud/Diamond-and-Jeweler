import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callFunction } from '../../lib/functions'
import { Button, Card, Alert, Input, PageHeader } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'

export default function InviteHM() {
  useSeo({ title: 'Invite a hiring manager', noindex: true })
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await callFunction('invite-hm', { email, full_name: fullName, job_title: jobTitle })
      setDone(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div className="max-w-xl mx-auto">
        <Card>
          <div className="p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="font-display text-2xl mb-2">Invite sent</h1>
            <p className="text-sm text-ink-600 mb-6">
              We emailed <strong>{email}</strong> a magic link. They'll complete their leadership profile
              once they sign in, then be ready to post roles.
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="secondary"
                onClick={() => { setDone(false); setEmail(''); setFullName(''); setJobTitle('') }}
              >Invite another</Button>
              <Button onClick={() => navigate('/hr')}>Back to HR dashboard</Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader
        eyebrow="New hiring manager"
        title="Invite a hiring manager"
        description="They'll get a magic-link email, complete a short leadership profile, and be ready to post roles."
      />
      <Card>
        <form onSubmit={submit} className="p-6 md:p-8 space-y-5">
          <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          <Input label="Work email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Input label="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Engineering Manager" required />
          {err && <Alert tone="red">{err}</Alert>}
          <div className="flex gap-2 justify-between pt-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/hr')} disabled={busy}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!email || !fullName || !jobTitle}>Send invite</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
