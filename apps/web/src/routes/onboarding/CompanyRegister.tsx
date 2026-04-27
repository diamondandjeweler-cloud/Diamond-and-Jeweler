import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { uploadPrivate } from '../../lib/storage'
import { markOnboardingComplete } from '../../lib/api'

export default function CompanyRegister() {
  const { session, profile, refresh } = useSession()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [regNo, setRegNo] = useState('')
  const [website, setWebsite] = useState('')
  const [size, setSize] = useState<'1-10' | '11-50' | '51-200' | '201-500' | '500+'>('11-50')
  const [industry, setIndustry] = useState('')
  const [licenseFile, setLicenseFile] = useState<File | null>(null)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!session || !profile) return null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      if (!licenseFile) throw new Error('Business license is required.')
      const userId = session!.user.id

      const licensePath = await uploadPrivate(
        'business-licenses',
        licenseFile,
        userId,
        licenseFile.name,
      )

      const { error } = await supabase.from('companies').insert({
        name,
        registration_number: regNo,
        business_license_path: licensePath,
        website: website || null,
        size,
        industry: industry || null,
        primary_hr_email: profile?.email ?? session!.user.email!,
        created_by: userId,
      })
      if (error) throw error

      await markOnboardingComplete(userId)
      await refresh()
      navigate('/hr', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">Register your company</h1>
        <p className="text-sm text-gray-600 mb-4">
          We verify every company before roles go live. Upload your business
          license; an admin will approve it within 1 business day.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <Text label="Company name" value={name} onChange={setName} required />
          <Text
            label="SSM registration number"
            value={regNo}
            onChange={setRegNo}
            required
            hint="Your Suruhanjaya Syarikat Malaysia company number."
          />
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

          <div>
            <label className="block text-sm mb-1">Business license</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              PDF or image. Max 5 MB. Stored privately; only admins can view.
            </p>
            {licenseFile && (
              <p className="mt-1 text-xs text-gray-600">Selected: {licenseFile.name}</p>
            )}
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <button
            type="submit"
            disabled={busy || !name || !regNo || !licenseFile}
            className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:bg-gray-300"
          >
            {busy ? 'Submitting…' : 'Register company'}
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
        className="w-full border rounded px-3 py-2"
        required={required}
      />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
