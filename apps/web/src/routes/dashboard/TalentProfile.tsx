import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import { PREFERENCE_ASPECTS } from '../../data/preference-aspects'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../../lib/useSeo'

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
}

export default function TalentProfile() {
  useSeo({ title: 'Your profile', noindex: true })
  const { session, profile, refresh } = useSession()
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
      const { error } = await supabase.from('profiles').update({
        whatsapp_number: trimmed || null,
        whatsapp_opt_in: whatsappOptIn && !!trimmed,
      }).eq('id', session.user.id)
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
        const { data, error } = await supabase
          .from('talents')
          .select('id, expected_salary_min, expected_salary_max, is_open_to_offers, privacy_mode, whitelist_companies, preference_ratings, parsed_resume, extraction_status, extraction_error, extraction_started_at')
          .eq('profile_id', userId)
          .maybeSingle()
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

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!talent) return
    setErr(null); setWaSaved(false); setBusy(true)

    if (salaryMin < 0 || salaryMax < 0) {
      setErr('Salary cannot be negative.'); setBusy(false); return
    }
    if (salaryMax > 500_000) {
      setErr('Maximum salary cannot exceed RM 500,000 / month.'); setBusy(false); return
    }
    if (salaryMin > salaryMax && salaryMax > 0) {
      setErr('Minimum salary must be ≤ maximum.'); setBusy(false); return
    }

    const payload = {
      expected_salary_min: salaryMin || null,
      expected_salary_max: salaryMax || null,
      is_open_to_offers: openToOffers,
      privacy_mode: privacy,
      whitelist_companies: privacy === 'whitelist' ? whitelistCompanies : [],
      preference_ratings: ratings,
    }
    const { data: updated, error } = await supabase.from('talents').update(payload)
      .eq('id', talent.id)
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

  if (loading) return <LoadingSpinner />
  if (!talent) {
    return (
      <div className="max-w-lg mx-auto text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Your profile isn't set up yet</h1>
        <p className="text-gray-600 mb-4">Finish onboarding so we can start matching you with roles.</p>
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
      <div className="bg-white border rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">Your profile</h1>
        <p className="text-sm text-gray-600 mb-6">
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
          <div className="mb-6 border border-ink-200 rounded-lg p-3 bg-ink-50 text-sm text-ink-700">{retryMsg}</div>
        )}

        {aiSummary ? (
          <div className="mb-6 border border-brand-200 rounded-lg p-4 bg-brand-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">How the system describes you</p>
            <p className="text-sm text-ink-800 leading-relaxed">{aiSummary}</p>
            <p className="text-xs text-ink-400 mt-2">This is what hiring managers see about your background and strengths when you appear as a match.</p>
          </div>
        ) : extractionStatus === 'complete' ? (
          <div className="mb-6 border border-dashed border-ink-200 rounded-lg p-4 bg-ink-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1">Profile summary</p>
            <p className="text-sm text-ink-500">No summary yet — complete your profile chat to generate this.</p>
          </div>
        ) : null}

        <form onSubmit={save} className="space-y-6">
          <section>
            <h2 className="font-semibold mb-2">Availability</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={openToOffers}
                onChange={(e) => setOpenToOffers(e.target.checked)}
              />
              I'm open to new offers
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Turn this off to stop receiving new matches without deleting your account.
            </p>
          </section>

          <section className="border-t pt-4">
            <h2 className="font-semibold mb-2">{t('whatsapp.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-sm mb-1">{t('whatsapp.numberLabel')}</label>
                <input
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+60 12 345 6789"
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={whatsappOptIn}
                    onChange={(e) => setWhatsappOptIn(e.target.checked)}
                  />
                  {t('whatsapp.optIn')}
                </label>
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
            <h2 className="font-semibold mb-2">Privacy</h2>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as PrivacyMode)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="public">Public — employers see your name if matched</option>
              <option value="anonymous">Anonymous — employers see only a candidate ID</option>
              <option value="whitelist">Whitelist — only specific companies (manage separately)</option>
            </select>
          </section>

          {privacy === 'whitelist' && (
            <section className="border-t pt-4">
              <h2 className="font-semibold mb-1">Whitelisted companies</h2>
              <p className="text-xs text-gray-500 mb-2">Only these companies will see you as a match. Enter each company name and press Enter.</p>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={whitelistInput}
                  onChange={(e) => setWhitelistInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const v = whitelistInput.trim()
                      if (v && !whitelistCompanies.includes(v)) setWhitelistCompanies((c) => [...c, v])
                      setWhitelistInput('')
                    }
                  }}
                  placeholder="Company name…"
                  className="flex-1 border rounded px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = whitelistInput.trim()
                    if (v && !whitelistCompanies.includes(v)) setWhitelistCompanies((c) => [...c, v])
                    setWhitelistInput('')
                  }}
                  className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
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
            <h2 className="font-semibold mb-2">Salary expectation (RM / month)</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="talent-salary-min" className="block text-sm mb-1">Minimum</label>
                <input
                  id="talent-salary-min"
                  type="number" min={0}
                  value={salaryMin || ''}
                  onChange={(e) => setSalaryMin(parseInt(e.target.value, 10) || 0)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="talent-salary-max" className="block text-sm mb-1">Maximum</label>
                <input
                  id="talent-salary-max"
                  type="number" min={0}
                  value={salaryMax || ''}
                  onChange={(e) => setSalaryMax(parseInt(e.target.value, 10) || 0)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Preferences (1 = not important, 5 = very)</h2>
            <div className="grid sm:grid-cols-2 gap-y-2 gap-x-4">
              {PREFERENCE_ASPECTS.map((aspect) => (
                <div key={aspect} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{aspect}</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRatings((x) => ({ ...x, [aspect]: r }))}
                        className={`w-7 h-7 border text-xs ${
                          ratings[aspect] === r
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white hover:bg-gray-50'
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

          <div className="flex gap-2 justify-between pt-2 border-t">
            <button
              type="button"
              onClick={() => navigate('/talent')}
              className="px-4 py-2 border rounded hover:bg-gray-50"
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
