import { useEffect, useState } from 'react'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Button, Input, Alert, PageHeader } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'

interface CompanyRow {
  name: string
  industry: string | null
  size: string | null
  website: string | null
  verified: boolean
}

export default function HMCompanyProfile() {
  useSeo({ title: 'Company profile', noindex: true })
  const { session, profile, refresh } = useSession()

  const [company, setCompany] = useState<CompanyRow | null>(null)
  const [jobTitle, setJobTitle] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    async function load() {
      const { data, error } = await supabase
        .from('hiring_managers')
        .select('job_title, companies(name, industry, size, website, verified)')
        .eq('profile_id', session!.user.id)
        .maybeSingle()
      setLoading(false)
      if (error) { setErr(error.message); return }
      if (data) {
        setJobTitle(data.job_title ?? '')
        setCompany((data.companies as CompanyRow | null) ?? null)
      }
    }
    void load()
  }, [session])

  useEffect(() => {
    if (profile) setFullName(profile.full_name)
  }, [profile?.id])

  async function save() {
    if (!session) return
    const nameTrimmed = fullName.trim()
    const titleTrimmed = jobTitle.trim()
    if (!nameTrimmed || !titleTrimmed) { setErr('Name and job title are required.'); return }
    setBusy(true); setSaved(false); setErr(null)
    try {
      const [profileRes, hmRes] = await Promise.all([
        supabase.from('profiles').update({ full_name: nameTrimmed }).eq('id', session.user.id),
        supabase.from('hiring_managers').update({ job_title: titleTrimmed }).eq('profile_id', session.user.id),
      ])
      if (profileRes.error) throw profileRes.error
      if (hmRes.error) throw hmRes.error
      await refresh()
      setSaved(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingSpinner full />

  return (
    <div className="max-w-xl">
      <PageHeader title="Company profile" description="Your professional details and company information." />
      <div className="space-y-6">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-ink-700 uppercase tracking-wide">Your details</h2>
          <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>

        {company && (
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-ink-700 uppercase tracking-wide mb-3">Company</h2>
            <InfoRow label="Name" value={company.name} />
            {company.industry && <InfoRow label="Industry" value={company.industry} />}
            {company.size && <InfoRow label="Size" value={company.size} />}
            {company.website && <InfoRow label="Website" value={company.website} />}
            <InfoRow label="Status" value={company.verified ? 'Verified ✓' : 'Pending verification'} />
          </div>
        )}

        {err && <Alert tone="red">{err}</Alert>}
        {saved && <Alert tone="green">Saved successfully.</Alert>}

        <Button onClick={() => void save()} loading={busy}>
          Save changes
        </Button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-ink-500 w-24 shrink-0">{label}</span>
      <span className="text-ink-900">{value}</span>
    </div>
  )
}
