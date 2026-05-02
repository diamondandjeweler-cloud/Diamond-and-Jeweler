import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { uploadPrivate } from '../../lib/storage'
import { markOnboardingComplete } from '../../lib/api'

type UserType = 'hr_admin' | 'hiring_manager'

export default function CompanyRegister() {
  const { session, profile, refresh } = useSession()
  const navigate = useNavigate()

  const [userType, setUserType] = useState<UserType>('hr_admin')
  const [name, setName] = useState('')
  const [regNo, setRegNo] = useState('')
  const [website, setWebsite] = useState('')
  const [size, setSize] = useState<'1-10' | '11-50' | '51-200' | '201-500' | '500+'>('1-10')
  const [industry, setIndustry] = useState('')
  const [licenseFile, setLicenseFile] = useState<File | null>(null)

  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'idle' | 'uploading' | 'saving'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [doneCompanyId, setDoneCompanyId] = useState<string | null>(null)

  if (!session || !profile) return null

  const isHM = userType === 'hiring_manager'
  const canSubmit = !busy && !!name && (isHM || !!regNo)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession) {
        setErr('Your session has expired. Please sign in again.')
        setBusy(false)
        navigate('/login', { replace: true })
        return
      }
      const userId = currentSession.user.id

      const timeout = <T,>(ms: number, label: string) =>
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out. Please check your internet and try again.`)), ms),
        )

      // Upload license only if provided (always optional now)
      let licensePath: string | null = null
      if (licenseFile) {
        setStep('uploading')
        licensePath = await Promise.race([
          uploadPrivate('business-licenses', licenseFile, userId, licenseFile.name),
          timeout<string>(45000, 'File upload'),
        ])
      }

      setStep('saving')
      // HMs get an auto-generated placeholder SSM so the not-null DB constraint is met.
      // HR Admins enter their real SSM number.
      const registrationNumber = isHM
        ? `HM-${userId.replace(/-/g, '').slice(-12).toUpperCase()}`
        : regNo

      const { data, error } = await Promise.race([
        supabase.from('companies').insert({
          name,
          registration_number: registrationNumber,
          business_license_path: licensePath,
          website: website || null,
          size,
          industry: industry || null,
          primary_hr_email: profile?.email ?? session!.user.email!,
          created_by: userId,
        }).select('id').single(),
        timeout<{ data: { id: string } | null; error: unknown }>(15000, 'Save'),
      ])
      if (error) throw error

      await markOnboardingComplete(userId)

      if (isHM && !licenseFile) {
        // Show the verification link panel before redirecting
        setDoneCompanyId(data?.id ?? null)
        setBusy(false)
        setStep('idle')
        return
      }

      await refresh()
      navigate('/hr', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e))
    } finally {
      setBusy(false)
      setStep('idle')
    }
  }

  // HM submitted without license — show verification link to share with HR Admin
  if (doneCompanyId) {
    const verifyUrl = `${window.location.origin}/onboarding/company/verify?company=${doneCompanyId}`
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-lg font-bold">✓</div>
            <div>
              <h1 className="text-xl font-bold">Company profile created</h1>
              <p className="text-sm text-gray-500">Pending verification</p>
            </div>
          </div>
          <p className="text-sm text-gray-700 mb-4">
            Your company <strong>{name}</strong> is registered. To post roles you need your HR Admin
            or company secretary to complete verification by uploading the SSM registration and business license.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-xs font-semibold text-amber-800 mb-2">Share this verification link with your HR Admin:</p>
            <div className="flex gap-2 items-center">
              <input
                readOnly
                value={verifyUrl}
                className="flex-1 text-xs bg-white border rounded px-2 py-1.5 text-gray-700 select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => navigator.clipboard.writeText(verifyUrl)}
                className="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 whitespace-nowrap"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-amber-700 mt-2">
              Your HR Admin opens this link, logs in, and uploads the SSM certificate + business license.
              Roles can go live only after admin verification.
            </p>
          </div>
          <button
            onClick={async () => { await refresh(); navigate('/hr', { replace: true }) }}
            className="w-full bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700"
          >
            Go to my dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-1">Register your company</h1>
        <p className="text-sm text-gray-500 mb-5">
          We verify every company before roles go live. An admin will approve within 1 business day.
        </p>

        {/* Role toggle */}
        <div className="flex rounded-lg border overflow-hidden mb-5">
          <button
            type="button"
            onClick={() => setUserType('hr_admin')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              userType === 'hr_admin'
                ? 'bg-brand-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            I'm an HR Admin / Company Owner
          </button>
          <button
            type="button"
            onClick={() => setUserType('hiring_manager')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              userType === 'hiring_manager'
                ? 'bg-brand-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            I'm a Hiring Manager
          </button>
        </div>

        {isHM && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-800">
            As a Hiring Manager you can skip the SSM number and license upload — your HR Admin
            will complete company verification. You'll get a shareable link after registration.
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <Text label="Company name" value={name} onChange={setName} required />

          {!isHM && (
            <Text
              label="SSM registration number"
              value={regNo}
              onChange={setRegNo}
              required
              hint="Your Suruhanjanya Syarikat Malaysia company number."
            />
          )}

          <Text label="Website" value={website} onChange={setWebsite} />

          <div>
            <label className="block text-sm mb-1">Company size</label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as typeof size)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="1-10">1 – 10</option>
              <option value="11-50">11 – 50</option>
              <option value="51-200">51 – 200</option>
              <option value="201-500">201 – 500</option>
              <option value="500+">500+</option>
            </select>
          </div>

          <Text label="Industry" value={industry} onChange={setIndustry} />

          {!isHM && (
            <div>
              <label className="block text-sm mb-1">
                Business license
                <span className="ml-2 text-xs font-normal text-gray-400">(optional — required for verification)</span>
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                PDF or image. Max 5 MB. Stored privately; only admins can view.
                You can submit now and upload later — verification won't complete until it's provided.
              </p>
              {licenseFile && (
                <p className="mt-1 text-xs text-gray-600">Selected: {licenseFile.name}</p>
              )}
            </div>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}

          {!busy && !name && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Company name is required.
            </p>
          )}
          {!busy && !isHM && name && !regNo && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              SSM registration number is required for HR Admin registration.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:bg-gray-300"
          >
            {step === 'uploading' ? 'Uploading file…'
              : step === 'saving' ? 'Saving…'
              : 'Register company'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Text({
  label,
  value,
  onChange,
  required,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        className="w-full border rounded px-3 py-2"
        required={required}
      />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
