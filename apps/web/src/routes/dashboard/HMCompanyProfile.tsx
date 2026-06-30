import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { updateProfile } from '../../data/repositories/profiles'
import { hmCompanyProfileByProfileId, updateHiringManagerByProfileId } from '../../data/repositories/hiring-managers'
import { FormSkeleton } from '../../components/ListSkeleton'
import { Button, Input, Alert, PageHeader } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'
import type { CompanyRow } from '../../types/db'

export default function HMCompanyProfile() {
  const { t } = useTranslation()
  useSeo({ title: t('hmCompany.seoTitle', 'Company profile'), noindex: true })
  const { session, profile, refresh } = useSession()
  const userId = session?.user.id

  const [company, setCompany] = useState<CompanyRow | null>(null)
  const [jobTitle, setJobTitle] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false
    async function load() {
      try {
        const { data, error } = await hmCompanyProfileByProfileId(userId)
          .maybeSingle()
        if (cancelled) return
        setLoading(false)
        if (error) { setErr(error.message); return }
        if (data) {
          setJobTitle(data.job_title ?? '')
          const co = Array.isArray(data.companies) ? (data.companies[0] as CompanyRow ?? null) : (data.companies as unknown as CompanyRow | null)
          setCompany(co)
        }
      } catch (e) {
        if (!cancelled) { setErr(e instanceof Error ? e.message : t('hmCompany.loadFailed', 'Load failed')); setLoading(false) }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (profile) setFullName(profile.full_name)
  }, [profile?.id])

  async function save() {
    if (!session) return
    const nameTrimmed = fullName.trim()
    const titleTrimmed = jobTitle.trim()
    if (!nameTrimmed || !titleTrimmed) { setErr(t('hmCompany.nameTitleRequired', 'Name and job title are required.')); return }
    setBusy(true); setSaved(false); setErr(null)
    try {
      const [profileRes, hmRes] = await Promise.all([
        updateProfile(session.user.id, { full_name: nameTrimmed }),
        updateHiringManagerByProfileId(session.user.id, { job_title: titleTrimmed }),
      ])
      if (profileRes.error) throw profileRes.error
      if (hmRes.error) throw hmRes.error
      await refresh()
      setSaved(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('hmCompany.saveFailed', 'Save failed'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-xl">
        <PageHeader title={t('hmCompany.title', 'Company profile')} description={t('hmCompany.description', 'Your professional details and company information.')} />
        <FormSkeleton fields={8} />
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <PageHeader title={t('hmCompany.title', 'Company profile')} description={t('hmCompany.description', 'Your professional details and company information.')} />
      <div className="space-y-6">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-ink-700 dark:text-gray-300 uppercase tracking-wide">{t('hmCompany.yourDetailsHeading', 'Your details')}</h2>
          <Input label={t('hmCompany.fullNameLabel', 'Full name')} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label={t('hmCompany.jobTitleLabel', 'Job title')} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>

        {company && (
          <div className="rounded-xl border border-ink-200 dark:border-gray-700 bg-ink-50 dark:bg-gray-800 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-ink-700 dark:text-gray-300 uppercase tracking-wide mb-3">{t('hmCompany.companyHeading', 'Company')}</h2>
            <InfoRow label={t('hmCompany.nameLabel', 'Name')} value={company.name} />
            {company.industry && <InfoRow label={t('hmCompany.industryLabel', 'Industry')} value={company.industry} />}
            {company.size && <InfoRow label={t('hmCompany.sizeLabel', 'Size')} value={company.size} />}
            {company.website && <InfoRow label={t('hmCompany.websiteLabel', 'Website')} value={company.website} />}
            <InfoRow label={t('hmCompany.statusLabel', 'Status')} value={company.verified ? t('hmCompany.statusVerified', 'Verified ✓') : t('hmCompany.statusPending', 'Pending verification')} />
          </div>
        )}

        {err && <Alert tone="red">{err}</Alert>}
        {saved && <Alert tone="green">{t('hmCompany.savedMsg', 'Saved successfully.')}</Alert>}

        <Button onClick={() => void save()} loading={busy}>
          {t('hmCompany.saveButton', 'Save changes')}
        </Button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-ink-500 dark:text-gray-400 w-24 shrink-0">{label}</span>
      <span className="text-ink-900 dark:text-white">{value}</span>
    </div>
  )
}
