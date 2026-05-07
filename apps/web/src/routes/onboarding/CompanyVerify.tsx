import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { uploadPrivate } from '../../lib/storage'

export default function CompanyVerify() {
  const { session, profile } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const companyId = params.get('company')

  const [company, setCompany] = useState<{ id: string; name: string; registration_number: string; verified: boolean } | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [regNo, setRegNo] = useState('')
  const [licenseFile, setLicenseFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'idle' | 'uploading' | 'saving'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Redirect to login, preserving this URL
  useEffect(() => {
    if (!session && profile === null) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true })
    }
  }, [session, profile, navigate])

  // Load company record
  useEffect(() => {
    if (!companyId || !session) return
    supabase
      .from('companies')
      .select('id, name, registration_number, verified')
      .eq('id', companyId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadErr('Company not found. The link may be invalid or expired.')
          return
        }
        setCompany(data)
        // Pre-fill if SSM was auto-generated (starts with HM-)
        if (!data.registration_number.startsWith('HM-')) {
          setRegNo(data.registration_number)
        }
      })
  }, [companyId, session])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!company || !session) return
    setErr(null)
    setBusy(true)
    try {
      const userId = session.user.id

      let licensePath: string | undefined
      if (licenseFile) {
        setStep('uploading')
        licensePath = await uploadPrivate('business-licenses', licenseFile, userId, licenseFile.name)
      }

      setStep('saving')
      const update: Record<string, unknown> = { registration_number: regNo.trim() }
      if (licensePath) update.business_license_path = licensePath

      const { error } = await supabase
        .from('companies')
        .update(update)
        .eq('id', company.id)
      if (error) throw error

      setDone(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setStep('idle')
    }
  }

  if (!session) return null

  if (!companyId) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-red-600">No company ID in URL. Please use the full link you were given.</p>
      </div>
    )
  }

  if (loadErr) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-red-600">{loadErr}</p>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-ink-500 animate-pulse">Loading…</p>
      </div>
    )
  }

  if (company.verified) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl font-bold mx-auto mb-4">✓</div>
        <h1 className="text-xl font-bold mb-2">{company.name} is verified</h1>
        <p className="text-ink-500 text-sm">No further action needed.</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl font-bold mx-auto mb-4">✓</div>
        <h1 className="text-xl font-bold mb-2">Documents submitted</h1>
        <p className="text-ink-500 text-sm mb-6">
          DNJ admin will review and verify <strong>{company.name}</strong> within 1 business day.
          Your hiring manager will be notified once approved.
        </p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="btn-primary"
        >
          Back to home
        </button>
      </div>
    )
  }

  const canSubmit = !busy && !!regNo.trim() && !!licenseFile

  return (
    <div className="max-w-lg mx-auto py-10 px-4">
      <div className="bg-white border border-ink-200 rounded-xl shadow-soft p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold">!</div>
          <div>
            <h1 className="text-lg font-bold text-ink-900">Complete company verification</h1>
            <p className="text-sm text-ink-500">{company.name}</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5 text-sm text-blue-800">
          Your hiring manager has registered this company. To let them post roles, please provide
          the SSM registration number and upload the business license.
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="company-verify-regno" className="block text-sm font-medium text-ink-700 mb-1">
              SSM registration number <span className="text-red-500">*</span>
            </label>
            <input
              id="company-verify-regno"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="e.g. 1234567-A"
              required
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-ink-400">Your Suruhanjaya Syarikat Malaysia company number.</p>
          </div>

          <div>
            <label htmlFor="company-verify-license" className="block text-sm font-medium text-ink-700 mb-1">
              Business license <span className="text-red-500">*</span>
            </label>
            <input
              id="company-verify-license"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            <p className="mt-1 text-xs text-ink-400">PDF or image. Max 5 MB. Stored privately; only DNJ admins can view.</p>
            {licenseFile && <p className="mt-1 text-xs text-ink-600">Selected: {licenseFile.name}</p>}
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:bg-ink-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {step === 'uploading' ? 'Uploading…' : step === 'saving' ? 'Saving…' : 'Submit verification documents'}
          </button>
        </form>
      </div>
    </div>
  )
}
