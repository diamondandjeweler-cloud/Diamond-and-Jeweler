import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import { PREFERENCE_ASPECTS } from '../../data/preference-aspects'
import { useTranslation } from 'react-i18next'

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
}

export default function TalentProfile() {
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

  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile) {
      setWhatsappNumber(profile.whatsapp_number ?? '')
      setWhatsappOptIn(profile.whatsapp_opt_in ?? false)
    }
  }, [profile?.id])

  async function saveWhatsApp() {
    if (!session) return
    setWaBusy(true); setWaSaved(false)
    try {
      const { error } = await supabase.from('profiles').update({
        whatsapp_number: whatsappNumber.trim() || null,
        whatsapp_opt_in: whatsappOptIn && !!whatsappNumber.trim(),
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

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('talents')
        .select('id, expected_salary_min, expected_salary_max, is_open_to_offers, privacy_mode, whitelist_companies, preference_ratings, parsed_resume')
        .eq('profile_id', session.user.id)
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
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [session])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!talent) return
    setErr(null); setWaSaved(false); setBusy(true)
    if (salaryMin > salaryMax) { setErr('Min salary must be ≤ max.'); setBusy(false); return }

    const { error } = await supabase.from('talents').update({
      expected_salary_min: salaryMin || null,
      expected_salary_max: salaryMax || null,
      is_open_to_offers: openToOffers,
      privacy_mode: privacy,
      whitelist_companies: privacy === 'whitelist' && whitelistCompanies.length > 0 ? whitelistCompanies : null,
      preference_ratings: ratings,
    }).eq('id', talent.id)
    setBusy(false)
    if (error) setErr(error.message)
    else navigate('/talent')
  }

  if (loading) return <LoadingSpinner />
  if (!talent) {
    return (
      <div className="max-w-lg mx-auto text-center">
        <p className="text-gray-600 mb-4">No talent profile found.</p>
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

        {aiSummary ? (
          <div className="mb-6 border border-brand-200 rounded-lg p-4 bg-brand-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">How the system describes you</p>
            <p className="text-sm text-ink-800 leading-relaxed">{aiSummary}</p>
            <p className="text-xs text-ink-400 mt-2">This is what hiring managers see about your background and strengths when you appear as a match.</p>
          </div>
        ) : (
          <div className="mb-6 border border-dashed border-ink-200 rounded-lg p-4 bg-ink-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-1">Profile summary</p>
            <p className="text-sm text-ink-500">No summary yet — complete your profile chat to generate this.</p>
          </div>
        )}

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
                <label className="block text-sm mb-1">Minimum</label>
                <input
                  type="number" min={0}
                  value={salaryMin || ''}
                  onChange={(e) => setSalaryMin(parseInt(e.target.value, 10) || 0)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Maximum</label>
                <input
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
