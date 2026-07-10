import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '../../lib/supabase'
import { updateProfile } from '../../data/repositories/profiles'
import { talentProfileByProfileId, updateTalentById } from '../../data/repositories/talents'
import { latestResumeDocument, insertTalentDocuments } from '../../data/repositories/talentDocuments'
import { FormSkeleton } from '../../components/ListSkeleton'
import { Switch } from '../../ui'
import { PREFERENCE_ASPECTS } from '../../data/preference-aspects'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../../lib/useSeo'
import { signedUrl, uploadPrivate } from '../../lib/storage'
import { validateSalaryRange } from '../../shared/domain/salary/validateSalaryRange'

type PrivacyMode = 'public' | 'anonymous' | 'whitelist'

interface TalentRow {
  id: string
  expected_salary_min: number | null
  expected_salary_max: number | null
  is_open_to_offers: boolean
  privacy_mode: PrivacyMode
  whitelist_companies: string[] | null
  preference_ratings: Record<string, number> | null
  parsed_resume: { ai_summary?: string | null } | null
  extraction_status: 'pending' | 'processing' | 'complete' | 'failed' | null
  extraction_error: string | null
  extraction_started_at: string | null
  photo_url: string | null
}

export default function TalentProfile() {
  useSeo({ title: 'Your profile', noindex: true })
  const { session, profile, refresh } = useSession(useShallow((s) => ({ session: s.session, profile: s.profile, refresh: s.refresh })))
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [talent, setTalent] = useState<TalentRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [salaryMin, setSalaryMin] = useState(0)
  const [salaryMax, setSalaryMax] = useState(0)
  const [openToOffers, setOpenToOffers] = useState(true)
  const [privacy, setPrivacy] = useState<PrivacyMode>('public')
  const [whitelistCompanies, setWhitelistCompanies] = useState<string[]>([])
  const [whitelistInput, setWhitelistInput] = useState('')
  const [ratings, setRatings] = useState<Record<string, number>>({})

  // WhatsApp prefs (live in profiles, not talents)
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [whatsappOptIn, setWhatsappOptIn] = useState(false)
  const [waSaved, setWaSaved] = useState(false)
  const [waBusy, setWaBusy] = useState(false)

  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [extractionStatus, setExtractionStatus] = useState<TalentRow['extraction_status']>(null)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [extractionStartedAt, setExtractionStartedAt] = useState<string | null>(null)
  const [retryBusy, setRetryBusy] = useState(false)
  const [retryMsg, setRetryMsg] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)

  const [photoBusy, setPhotoBusy] = useState(false)
  const [resumeBusy, setResumeBusy] = useState(false)
  const [docMsg, setDocMsg] = useState<string | null>(null)
  const cachedResumeRef = useRef<{ storage_path: string; file_name: string } | null>(null)

  async function viewPhoto() {
    if (!talent) return
    if (!talent.photo_url) { setDocMsg('No photo on file.'); return }
    setDocMsg(null); setPhotoBusy(true)
    try {
      const url = await signedUrl('talent-photos', talent.photo_url, 60)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setDocMsg(`Could not load photo: ${(e as Error).message}`)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !session || !talent) return
    setDocMsg(null); setPhotoBusy(true)
    try {
      const path = await uploadPrivate('talent-photos', file, session.user.id, file.name)
      const { error } = await updateTalentById(talent.id, { photo_url: path })
      if (error) throw error
      setTalent({ ...talent, photo_url: path })
      setDocMsg('Photo updated.')
    } catch (e) {
      setDocMsg(`Upload failed: ${(e as Error).message}`)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function viewResume() {
    if (!talent) return
    setDocMsg(null); setResumeBusy(true)
    try {
      let doc = cachedResumeRef.current
      if (!doc) {
        const { data, error } = await latestResumeDocument(talent.id)
        if (error) throw error
        if (!data) { setDocMsg('No resume on file.'); return }
        doc = { storage_path: data.storage_path, file_name: data.file_name as string }
        cachedResumeRef.current = doc
      }
      const url = await signedUrl('resumes', doc.storage_path, 60)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setDocMsg(`Could not load resume: ${(e as Error).message}`)
    } finally {
      setResumeBusy(false)
    }
  }

  async function onResumeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !session || !talent) return
    setDocMsg(null); setResumeBusy(true)
    try {
      const path = await uploadPrivate('resumes', file, session.user.id, file.name)
      const { error } = await insertTalentDocuments({
        talent_id: talent.id,
        doc_type: 'resume',
        storage_path: path,
        file_name: file.name,
        purge_after: null,
      })
      if (error) throw error
      cachedResumeRef.current = { storage_path: path, file_name: file.name }
      setDocMsg('Resume updated.')
    } catch (e) {
      setDocMsg(`Upload failed: ${(e as Error).message}`)
    } finally {
      setResumeBusy(false)
    }
  }

  useEffect(() => {
    if (profile) {
      setWhatsappNumber(profile.whatsapp_number ?? '')
      setWhatsappOptIn(profile.whatsapp_opt_in ?? false)
    }
    // We intentionally key on profile.id only — re-syncing on every profile field change
    // would clobber unsaved edits in the input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function saveWhatsApp() {
    if (!session) return
    const trimmed = whatsappNumber.trim()
    if (trimmed && !/^\+?[0-9\s\-()]{7,20}$/.test(trimmed)) {
      setErr('Phone number contains invalid characters. Use digits, spaces, + or hyphens only (e.g. +60 12 345 6789).')
      return
    }
    setWaBusy(true); setWaSaved(false); setErr(null)
    try {
      const { error } = await updateProfile(session.user.id, {
        whatsapp_number: trimmed || null,
        whatsapp_opt_in: whatsappOptIn && !!trimmed,
      })
      if (error) throw error
      await refresh()
      setWaSaved(true)
      setTimeout(() => setWaSaved(false), 2000)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setWaBusy(false)
    }
  }

  // Key the fetch on user.id so a routine TOKEN_REFRESHED event (which mints a
  // new session object every hour) does not cancel the in-flight load mid-way
  // and leave the page stuck on the spinner. Without this, the cleanup function
  // sets cancelled=true before the fetch resolves, so setLoading(false) is
  // skipped — that is the "page stuck on Sedang memuat… after navigating" bug.
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await talentProfileByProfileId(userId)
        if (cancelled) return
        if (error) setErr(error.message)
        else if (data) {
          const row = data as TalentRow
          setTalent(row)
          setSalaryMin(row.expected_salary_min ?? 0)
          setSalaryMax(row.expected_salary_max ?? 0)
          setOpenToOffers(row.is_open_to_offers)
          setPrivacy(row.privacy_mode)
          setWhitelistCompanies(row.whitelist_companies ?? [])
          setRatings(row.preference_ratings ?? {})
          setAiSummary((row.parsed_resume?.ai_summary as string | null) ?? null)
          setExtractionStatus(row.extraction_status ?? null)
          setExtractionError(row.extraction_error ?? null)
          setExtractionStartedAt(row.extraction_started_at ?? null)
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  async function retryExtraction() {
    if (!session || !talent) return
    setRetryBusy(true); setRetryMsg(null); setErr(null)
    try {
      const { data: authData } = await supabase.auth.getSession()
      const token = authData.session?.access_token
      if (!token) throw new Error('Not authenticated')
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enqueue-talent-extraction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ talent_id: talent.id }),
        },
      )
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Retry failed (${res.status}) ${txt}`)
      }
      setExtractionStatus('processing')
      setExtractionError(null)
      setExtractionStartedAt(new Date().toISOString())
      setRetryMsg('Analysis restarted — usually under 2 minutes. Refresh in a moment to see updates.')
    } catch (e) {
      setRetryMsg((e as Error).message)
    } finally {
      setRetryBusy(false)
    }
  }

  function addWhitelistEntry() {
    const v = whitelistInput.trim()
    if (!v) return
    if (/<[^>]*>|javascript:/i.test(v) || /on\w+\s*=/i.test(v)) {
      setErr('Company name contains invalid characters. Remove any HTML or script content.')
      return
    }
    if (!whitelistCompanies.includes(v)) setWhitelistCompanies((c) => [...c, v])
    setWhitelistInput('')
    setErr(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!talent) return
    setErr(null); setWaSaved(false); setBusy(true)

    const salaryErr = validateSalaryRange(salaryMin, salaryMax, {
      negative: { message: 'Salary cannot be negative.' },
      ceiling: { limit: 500_000, message: 'Maximum salary cannot exceed RM 500,000 / month.' },
      minMaxRequiresMaxAboveZero: true,
      minMaxMessage: 'Minimum salary must be ≤ maximum.',
    })
    if (salaryErr) {
      setErr(salaryErr); setBusy(false); return
    }

    const payload = {
      expected_salary_min: salaryMin || null,
      expected_salary_max: salaryMax || null,
      is_open_to_offers: openToOffers,
      privacy_mode: privacy,
      whitelist_companies: privacy === 'whitelist' ? whitelistCompanies : [],
      preference_ratings: ratings,
    }
    const { data: updated, error } = await updateTalentById(talent.id, payload)
      .select('expected_salary_min, expected_salary_max, privacy_mode')
      .single()
    setBusy(false)
    if (error) { setErr(error.message); return }

    // Detect silent server-side reversion (e.g. trigger enforcing range/mode rules).
    if (updated) {
      const issues: string[] = []
      if (payload.expected_salary_min !== null && updated.expected_salary_min !== payload.expected_salary_min)
        issues.push(`Minimum salary was adjusted by the server (saved as RM ${updated.expected_salary_min?.toLocaleString()}).`)
      if (payload.expected_salary_max !== null && updated.expected_salary_max !== payload.expected_salary_max)
        issues.push(`Maximum salary was adjusted by the server (saved as RM ${updated.expected_salary_max?.toLocaleString()}).`)
      if (updated.privacy_mode !== payload.privacy_mode)
        issues.push(`Privacy mode could not be changed to "${payload.privacy_mode}" — saved as "${updated.privacy_mode}". Contact support if you believe this is an error.`)
      if (issues.length > 0) { setErr(issues.join(' ')); return }
    }

    navigate('/talent')
  }

  if (loading) return <FormSkeleton fields={10} />
  if (!talent) {
    return (
      <div className="max-w-lg mx-auto text-center">
        <h1 className="font-display text-2xl text-fg mb-2">Your profile isn't set up yet</h1>
        <p className="text-gray-600 dark:text-fg-strong mb-4">Finish onboarding so we can start matching you with roles.</p>
        <button
          onClick={() => navigate('/onboarding/talent')}
          className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700"
        >
          Complete onboarding
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-surface border dark:border-border rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2 dark:text-fg">Your profile</h1>
        <p className="text-sm text-gray-600 dark:text-fg-strong mb-6">
          Tune what employers see and what kinds of roles we surface for you.
        </p>

        {(extractionStatus === 'pending' || extractionStatus === 'processing') && (
          <div className="mb-6 border border-brand-200 rounded-lg p-4 bg-brand-50 flex items-start gap-3">
            <svg className="animate-spin h-5 w-5 text-brand-500 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div className="text-sm text-brand-900">
              <div className="font-semibold">We're still analysing your profile</div>
              <div className="text-brand-800 mt-0.5">Usually finishes in under 2 minutes. Your summary will appear here once it's ready.</div>
              {extractionStartedAt && Date.now() - new Date(extractionStartedAt).getTime() > 10 * 60_000 && (
                <button
                  type="button"
                  onClick={retryExtraction}
                  disabled={retryBusy}
                  className="mt-2 text-xs font-semibold text-brand-700 underline disabled:opacity-50"
                >
                  {retryBusy ? 'Restarting…' : 'Taking too long? Restart analysis'}
                </button>
              )}
            </div>
          </div>
        )}

        {extractionStatus === 'failed' && (
          <div className="mb-6 border border-red-200 rounded-lg p-4 bg-red-50">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-red-600 text-lg leading-none">⚠️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-900">We couldn't finish analysing your profile</p>
                {extractionError && (
                  <p className="text-xs text-red-700 mt-1 break-words">{extractionError}</p>
                )}
                <p className="text-xs text-red-700 mt-1">Click below to retry — your chat transcript is saved.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={retryExtraction}
              disabled={retryBusy}
              className="bg-red-600 text-white text-sm px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
            >
              {retryBusy ? 'Restarting…' : 'Retry analysis'}
            </button>
          </div>
        )}

        {retryMsg && (
          <div className="mb-6 border border-border rounded-lg p-3 bg-ink-50 dark:bg-surface text-sm text-ink-700 dark:text-fg-strong">{retryMsg}</div>
        )}

        {aiSummary ? (
          <div className="mb-6 border border-brand-200 rounded-lg p-4 bg-brand-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">How the system describes you</p>
            <p className="text-sm text-ink-800 dark:text-fg-strong leading-relaxed">{aiSummary}</p>
            <p className="text-xs text-ink-400 dark:text-fg-muted mt-2">This is what hiring managers see about your background and strengths when you appear as a match.</p>
          </div>
        ) : extractionStatus === 'complete' ? (
          <div className="mb-6 border border-dashed border-border rounded-lg p-4 bg-ink-50 dark:bg-surface">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-fg-muted mb-1">Profile summary</p>
            <p className="text-sm text-fg-muted">No summary yet — complete your profile chat to generate this.</p>
          </div>
        ) : null}

        <section className="mb-6 border-t dark:border-border pt-4">
          <h2 className="font-semibold mb-2 dark:text-fg">Documents</h2>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm w-24 text-gray-700 dark:text-fg-strong">Photo</span>
              <button
                type="button"
                onClick={() => void viewPhoto()}
                disabled={photoBusy}
                className="px-3 py-1.5 border dark:border-border rounded text-sm dark:text-fg-strong hover:bg-surface-2 disabled:opacity-50"
              >
                {photoBusy ? 'Loading…' : 'View photo'}
              </button>
              <label className="px-3 py-1.5 border dark:border-border rounded text-sm dark:text-fg-strong hover:bg-surface-2 cursor-pointer">
                Replace photo
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => void onPhotoFile(e)}
                  disabled={photoBusy}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm w-24 text-gray-700 dark:text-fg-strong">Resume</span>
              <button
                type="button"
                onClick={() => void viewResume()}
                disabled={resumeBusy}
                className="px-3 py-1.5 border dark:border-border rounded text-sm dark:text-fg-strong hover:bg-surface-2 disabled:opacity-50"
              >
                {resumeBusy ? 'Loading…' : 'View resume'}
              </button>
              <label className="px-3 py-1.5 border dark:border-border rounded text-sm dark:text-fg-strong hover:bg-surface-2 cursor-pointer">
                Replace resume
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => void onResumeFile(e)}
                  disabled={resumeBusy}
                />
              </label>
            </div>
            {docMsg && <p className="text-xs text-ink-700 dark:text-fg-strong">{docMsg}</p>}
            <p className="text-xs text-fg-muted">Files open in a new tab via a short-lived secure link.</p>
          </div>
        </section>

        <form onSubmit={save} className="space-y-6">
          <section>
            <h2 className="font-semibold mb-2 dark:text-fg">Availability</h2>
            <Switch
              checked={openToOffers}
              onCheckedChange={setOpenToOffers}
              label="I'm open to new offers"
            />
            <p className="text-xs text-fg-muted mt-1">
              Turn this off to stop receiving new matches without deleting your account.
            </p>
          </section>

          <section className="border-t dark:border-border pt-4">
            <h2 className="font-semibold mb-2 dark:text-fg">{t('whatsapp.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
              <div>
                <label htmlFor="talent-wa-number" className="block text-sm mb-1 dark:text-fg-strong">{t('whatsapp.numberLabel')}</label>
                <input
                  id="talent-wa-number"
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+60 12 345 6789"
                  className="w-full border dark:border-border bg-surface dark:text-fg dark:placeholder-fg-subtle rounded px-3 py-2"
                />
              </div>
              <div className="flex items-end">
                <Switch
                  checked={whatsappOptIn}
                  onCheckedChange={setWhatsappOptIn}
                  label={t('whatsapp.optIn')}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void saveWhatsApp()}
              disabled={waBusy}
              className="text-sm text-brand-700 underline-offset-2 hover:underline disabled:opacity-60"
            >
              {waBusy ? t('common.loading') : t('common.save')}
            </button>
            {waSaved && <span className="ml-2 text-xs text-emerald-700">✓ {t('whatsapp.saved')}</span>}
          </section>

          <section>
            <label htmlFor="talent-privacy" className="block font-semibold mb-2 dark:text-fg">Privacy</label>
            <select
              id="talent-privacy"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as PrivacyMode)}
              className="w-full border dark:border-border bg-surface dark:text-fg rounded px-3 py-2"
            >
              <option value="public">Public — employers see your name if matched</option>
              <option value="anonymous">Anonymous — employers see only a candidate ID</option>
              <option value="whitelist">Whitelist — only specific companies (manage separately)</option>
            </select>
          </section>

          {privacy === 'whitelist' && (
            <section className="border-t dark:border-border pt-4">
              <h2 className="font-semibold mb-1 dark:text-fg">Whitelisted companies</h2>
              <p className="text-xs text-fg-muted mb-2">Only these companies will see you as a match. Enter each company name and press Enter.</p>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  aria-label="Company name to whitelist"
                  value={whitelistInput}
                  onChange={(e) => setWhitelistInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addWhitelistEntry()
                    }
                  }}
                  placeholder="Company name…"
                  className="flex-1 border dark:border-border bg-surface dark:text-fg dark:placeholder-fg-subtle rounded px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={addWhitelistEntry}
                  className="px-3 py-2 border dark:border-border rounded text-sm dark:text-fg-strong hover:bg-surface-2"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {whitelistCompanies.map((co) => (
                  <span key={co} className="flex items-center gap-1 bg-brand-50 border border-brand-200 text-brand-800 text-xs px-2 py-0.5 rounded-full">
                    {co}
                    <button type="button" onClick={() => setWhitelistCompanies((c) => c.filter((x) => x !== co))} className="text-brand-400 hover:text-brand-700 leading-none">×</button>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="font-semibold mb-2 dark:text-fg">Salary expectation (RM / month)</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="talent-salary-min" className="block text-sm mb-1 dark:text-fg-strong">Minimum</label>
                <input
                  id="talent-salary-min"
                  type="number" min={0}
                  value={salaryMin || ''}
                  onChange={(e) => setSalaryMin(parseInt(e.target.value, 10) || 0)}
                  className="w-full border dark:border-border bg-surface dark:text-fg rounded px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="talent-salary-max" className="block text-sm mb-1 dark:text-fg-strong">Maximum</label>
                <input
                  id="talent-salary-max"
                  type="number" min={0}
                  value={salaryMax || ''}
                  onChange={(e) => setSalaryMax(parseInt(e.target.value, 10) || 0)}
                  className="w-full border dark:border-border bg-surface dark:text-fg rounded px-3 py-2"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-semibold mb-2 dark:text-fg">Preferences (1 = not important, 5 = very)</h2>
            <div className="grid sm:grid-cols-2 gap-y-2 gap-x-4">
              {PREFERENCE_ASPECTS.map((aspect) => (
                <div key={aspect} className="flex items-center justify-between gap-2">
                  <span className="text-sm dark:text-fg-strong">{aspect}</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRatings((x) => ({ ...x, [aspect]: r }))}
                        className={`w-7 h-7 border dark:border-gray-700 text-xs ${
                          ratings[aspect] === r
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white dark:bg-gray-800 dark:text-fg-strong hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <div className="flex gap-2 justify-between pt-2 border-t dark:border-border">
            <button
              type="button"
              onClick={() => navigate('/talent')}
              className="px-4 py-2 border dark:border-gray-700 rounded dark:text-fg-strong hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:bg-gray-300"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
