import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { callFunction } from '../../lib/functions'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Button, Card, Alert, Input, Select, Textarea, PageHeader } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'
import { getLifeChartCharacter, type Gender } from '../../lib/lifeChartCharacter'

type TeamMember = { dob: string; gender: '' | Gender }

const TRAITS = [
  'self_starter', 'reliable', 'collaborator', 'growth_minded', 'clear_communicator',
  'detail_oriented', 'adaptable', 'customer_focused', 'analytical', 'accountable',
]

export default function PostRole() {
  useSeo({ title: 'Post a role', noindex: true })
  const { session } = useSession()
  const navigate = useNavigate()

  const [hmId, setHmId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [teamSize, setTeamSize] = useState<number | ''>('')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [department, setDepartment] = useState('')
  const [location, setLocation] = useState('Kuala Lumpur')
  const [locationPostcode, setLocationPostcode] = useState('')
  const [industry, setIndustry] = useState('')
  const [acceptNoExperience, setAcceptNoExperience] = useState(false)
  const [workArr, setWorkArr] = useState<'remote' | 'hybrid' | 'onsite'>('hybrid')
  const [experience, setExperience] = useState<'entry' | 'junior' | 'mid' | 'senior' | 'lead'>('mid')
  const [salaryMin, setSalaryMin] = useState(0)
  const [salaryMax, setSalaryMax] = useState(0)
  const [requiredTraits, setRequiredTraits] = useState<string[]>([])
  const [employmentType, setEmploymentType] = useState<'full_time'|'part_time'|'contract'|'gig'|'internship'>('full_time')
  const [hourlyRate, setHourlyRate] = useState(0)
  const [durationDays, setDurationDays] = useState<number | ''>('')
  const [startDate, setStartDate] = useState<string>('')
  const [requiresWeekend, setRequiresWeekend] = useState(false)
  const [requiresDrivingLicense, setRequiresDrivingLicense] = useState(false)
  const [requiresTravel, setRequiresTravel] = useState(false)
  const [hasNightShifts, setHasNightShifts] = useState(false)
  const [requiresOwnCar, setRequiresOwnCar] = useState(false)
  const [requiresRelocation, setRequiresRelocation] = useState(false)
  const [requiresOvertime, setRequiresOvertime] = useState(false)
  const [isCommissionBased, setIsCommissionBased] = useState(false)
  const [weightPreset, setWeightPreset] = useState<'default'|'operations'|'technical'|'creative'|'sales'|'management'>('default')

  const [marketWarning, setMarketWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftErr, setDraftErr] = useState<string | null>(null)

  async function generateDraft() {
    setDraftErr(null)
    if (!title.trim()) {
      setDraftErr('Type a role title first — the draft is built from it.')
      return
    }
    setDrafting(true)
    try {
      const res = await callFunction<{ description: string }>('draft-role-description', {
        title: title.trim(),
        location: location || undefined,
        employment_type: employmentType,
        weight_preset: weightPreset === 'default' ? undefined : weightPreset,
        industry: industry.trim() || undefined,
      })
      if (res?.description) setDescription(res.description)
      else setDraftErr('No draft returned. Try again.')
    } catch (e) {
      setDraftErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDrafting(false)
    }
  }

  useEffect(() => {
    if (!session) return
    supabase.from('hiring_managers').select('id').eq('profile_id', session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        setHmId(data?.id ?? null)
        setLoading(false)
      })
  }, [session])

  useEffect(() => {
    const n = typeof teamSize === 'number' ? Math.max(0, Math.min(50, teamSize)) : 0
    setTeamMembers((prev) => {
      if (prev.length === n) return prev
      const next = prev.slice(0, n)
      while (next.length < n) next.push({ dob: '', gender: '' })
      return next
    })
  }, [teamSize])

  useEffect(() => {
    if (!title || !salaryMin || !salaryMax) { setMarketWarning(null); return }
    let cancelled = false
    supabase.from('market_rate_cache').select('min_salary, max_salary, median_salary')
      .ilike('job_title', title).eq('location', location).eq('experience_level', experience)
      .limit(1).maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) { setMarketWarning(null); return }
        const below = salaryMax < (data.min_salary ?? 0)
        const above = salaryMin > (data.max_salary ?? 0)
        if (below) setMarketWarning(`Your range is below market for ${location} ${experience} ${title}: RM ${fmt(data.min_salary)}–${fmt(data.max_salary)} (median RM ${fmt(data.median_salary)}).`)
        else if (above) setMarketWarning(`Your range is above market for ${location} ${experience} ${title}: RM ${fmt(data.min_salary)}–${fmt(data.max_salary)} (median RM ${fmt(data.median_salary)}).`)
        else setMarketWarning(null)
      })
    return () => { cancelled = true }
  }, [title, location, experience, salaryMin, salaryMax])

  function toggleTrait(t: string) {
    setRequiredTraits((xs) => xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!hmId) { setErr('No hiring manager profile found.'); return }
    if (requiredTraits.length === 0) { setErr('Pick at least one required trait.'); return }
    if (salaryMin > salaryMax) { setErr('Salary min must be less than or equal to max.'); return }

    setBusy(true)
    try {
      const insertPromise = supabase.from('roles').insert({
        hiring_manager_id: hmId, title,
        description: description || null, department: department || null,
        location: location || null,
        location_postcode: locationPostcode.trim() || null,
        industry: industry.trim() || null,
        accept_no_experience: acceptNoExperience,
        work_arrangement: workArr, experience_level: experience,
        salary_min: salaryMin || null, salary_max: salaryMax || null,
        required_traits: requiredTraits, status: 'active',
        employment_type: employmentType,
        hourly_rate: employmentType === 'gig' || employmentType === 'part_time' || employmentType === 'contract' ? (hourlyRate || null) : null,
        duration_days: durationDays === '' ? null : Number(durationDays),
        start_date: startDate || null,
        requires_weekend: requiresWeekend,
        requires_driving_license: requiresDrivingLicense,
        requires_travel: requiresTravel,
        has_night_shifts: hasNightShifts,
        requires_own_car: requiresOwnCar,
        requires_relocation: requiresRelocation,
        requires_overtime: requiresOvertime,
        is_commission_based: isCommissionBased,
        weight_preset: weightPreset === 'default' ? null : weightPreset,
        team_member_characters: (() => {
          // `m.dob` is a 4-digit birth year — we collect year only because
          // colleagues' full DOB is hard for an HM to gather. Synthesise a
          // mid-year date (July 1) so the solar-year February boundary is
          // never ambiguous.
          const chars = teamMembers
            .map((m) => {
              if (!m.dob || !m.gender) return null
              const year = parseInt(m.dob, 10)
              if (!Number.isFinite(year) || year < 1950 || year > 2100) return null
              return getLifeChartCharacter(`${year}-07-01`, m.gender)
            })
            .filter((c): c is NonNullable<typeof c> => c !== null)
          return chars.length > 0 ? chars : null
        })(),
      }).select('id').single()
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Network timeout — check your connection and try again.')), 45000),
      )
      const { data: inserted, error: insErr } = await Promise.race([insertPromise, timeout]) as Awaited<typeof insertPromise>
      if (insErr) throw insErr
      // Compliance gate first, then matching. moderate-role flips
      // moderation_status; match-generate already only runs against approved
      // active roles, so it's safe to fire-and-forget in parallel — if
      // moderation rejects the role, the matches just won't surface.
      void callFunction('moderate-role', { role_id: inserted.id }).catch(() => {})
      void callFunction('match-generate', { role_id: inserted.id }).catch(() => {})
      navigate('/hm', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  if (loading) return <LoadingSpinner />
  if (!hmId) {
    return (
      <div className="max-w-xl mx-auto">
        <Alert tone="red" title="No hiring-manager profile">
          Ask your HR contact to re-send your invitation.
        </Alert>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        eyebrow="New role"
        title="Post a role"
        description="Up to three candidates will be curated for this role as talents become eligible. Pilot estimate: ~14 days."
      />

      <Card>
        <form onSubmit={submit} className="p-6 md:p-8 space-y-6">
          <Input label="Role title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Senior Backend Engineer" />

          <div>
            <div className="flex items-end justify-between gap-3 mb-1">
              <div className="field-label">Description</div>
              <button
                type="button"
                onClick={() => void generateDraft()}
                disabled={drafting || !title.trim()}
                className="text-xs px-2.5 py-1 rounded-md border border-ink-200 text-ink-700 hover:border-ink-400 hover:text-ink-900 disabled:opacity-50 disabled:cursor-not-allowed transition"
                title={!title.trim() ? 'Type a role title first' : 'Generate a starter draft from the title'}
              >
                {drafting ? 'Drafting…' : description ? 'Regenerate draft' : '✨ Generate draft'}
              </button>
            </div>
            <Textarea hint="What the candidate will own. Keep it concrete. Click 'Generate draft' if you're stuck." value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
            {draftErr && <p className="text-xs text-red-600 mt-1">{draftErr}</p>}
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <Input label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
            <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>

          <Input
            label="Office postcode (optional)"
            hint="Used for proximity matching when applicants opt-in to commute distance."
            value={locationPostcode}
            onChange={(e) => setLocationPostcode(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
            inputMode="numeric"
            maxLength={5}
            placeholder="e.g. 50450"
          />

          <Input
            label="Industry (optional)"
            hint="e.g. accounting, retail, F&B, software. Used by the matching engine to gauge background fit."
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. accounting"
          />

          <label htmlFor="post-role-accept-no-exp" className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              id="post-role-accept-no-exp"
              type="checkbox"
              checked={acceptNoExperience}
              onChange={(e) => setAcceptNoExperience(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-ink-900">Open to applicants without prior experience in this field.</span>
              <span className="block text-xs text-ink-500 mt-0.5">
                Off-field candidates won&apos;t be filtered out. Senior / lead roles still require relevant background unless this is checked.
              </span>
            </span>
          </label>


          <div className="grid md:grid-cols-2 gap-5">
            <Select label="Work arrangement" value={workArr} onChange={(e) => setWorkArr(e.target.value as typeof workArr)}>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Onsite</option>
            </Select>
            <Select label="Experience level" value={experience} onChange={(e) => setExperience(e.target.value as typeof experience)}>
              <option value="entry">Entry</option>
              <option value="junior">Junior</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
            </Select>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <Select label="Employment type" value={employmentType} onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="gig">Gig / project</option>
              <option value="internship">Internship</option>
            </Select>
            {(employmentType === 'gig' || employmentType === 'part_time' || employmentType === 'contract') ? (
              <Input label="Hourly rate (RM)" type="number" min={0} step="0.01" value={hourlyRate || ''} onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)} />
            ) : (
              <Input label="Salary min (RM / month)" type="number" min={0} value={salaryMin || ''} onChange={(e) => setSalaryMin(parseInt(e.target.value, 10) || 0)} />
            )}
            {(employmentType === 'gig' || employmentType === 'contract') ? (
              <Input label="Duration (days)" type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))} />
            ) : (
              <Input label="Salary max (RM / month)" type="number" min={0} value={salaryMax || ''} onChange={(e) => setSalaryMax(parseInt(e.target.value, 10) || 0)} />
            )}
          </div>

          <Input label="Start date (optional)" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />

          {marketWarning && (
            <Alert tone="amber" title="Market-rate check">{marketWarning}</Alert>
          )}

          {/* Role requirements */}
          <div className="space-y-2">
            <div className="field-label">Role requirements</div>
            <div className="field-hint mb-2">Used as hard filters — candidates who cannot meet these are excluded before scoring.</div>
            <label className="flex items-center gap-3 border border-ink-200 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 transition-colors">
              <input
                type="checkbox"
                checked={requiresWeekend}
                onChange={(e) => setRequiresWeekend(e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 accent-brand-500"
              />
              <span className="text-sm text-ink-800">Role requires weekend work</span>
            </label>
            <label className="flex items-center gap-3 border border-ink-200 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 transition-colors">
              <input
                type="checkbox"
                checked={requiresDrivingLicense}
                onChange={(e) => setRequiresDrivingLicense(e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 accent-brand-500"
              />
              <span className="text-sm text-ink-800">Role requires a driving licence</span>
            </label>
            {[
              { state: requiresTravel,     setter: setRequiresTravel,     label: 'Role requires travel' },
              { state: hasNightShifts,     setter: setHasNightShifts,     label: 'Role has night shifts / shift work' },
              { state: requiresOwnCar,     setter: setRequiresOwnCar,     label: 'Must have own transport / car' },
              { state: requiresRelocation, setter: setRequiresRelocation, label: 'Must be willing to relocate' },
              { state: requiresOvertime,   setter: setRequiresOvertime,   label: 'Overtime is expected' },
              { state: isCommissionBased,  setter: setIsCommissionBased,  label: 'Commission-based or variable pay structure' },
            ].map(({ state, setter, label }) => (
              <label key={label} className="flex items-center gap-3 border border-ink-200 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 transition-colors">
                <input
                  type="checkbox"
                  checked={state}
                  onChange={(e) => setter(e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 accent-brand-500"
                />
                <span className="text-sm text-ink-800">{label}</span>
              </label>
            ))}
          </div>

          {/* Matching weight preset */}
          <Select
            label="Matching profile"
            hint="Shifts which signals the engine prioritises for this role. Leave on Default if unsure."
            value={weightPreset}
            onChange={(e) => setWeightPreset(e.target.value as typeof weightPreset)}
          >
            <option value="default">Default — balanced weights</option>
            <option value="operations">Operations — reliability, culture, feedback</option>
            <option value="technical">Technical — hard skills, background, behavioural rigour</option>
            <option value="creative">Creative — culture fit, style, background</option>
            <option value="sales">Sales — relationship signals, character, HM feedback</option>
            <option value="management">Management — leadership behaviourals, culture, seniority</option>
          </Select>

          <div>
            <div className="field-label">Required traits <span className="text-red-500">*</span></div>
            <div className="field-hint mb-3">Pick 1–5. We match on these against each talent's behavioural tags.</div>
            <div className="flex flex-wrap gap-2">
              {TRAITS.map((t) => {
                const on = requiredTraits.includes(t)
                const atCap = !on && requiredTraits.length >= 5
                return (
                  <button
                    key={t} type="button"
                    onClick={() => toggleTrait(t)}
                    disabled={atCap}
                    className={`text-sm px-3 py-1.5 rounded-full border transition ${
                      on
                        ? 'bg-ink-900 text-white border-ink-900'
                        : atCap
                          ? 'bg-ink-50 text-ink-300 border-ink-100 cursor-not-allowed'
                          : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400 hover:text-ink-900'
                    }`}
                  >
                    {t.replace(/_/g, ' ')}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-ink-100">
            <div>
              <div className="field-label">Team-dynamic reference (optional)</div>
              <div className="field-hint mb-2">
                Tell us how many existing colleagues this hire will work with directly, then enter each colleague's
                year of birth and gender. We use this to gauge team-dynamic compatibility — it stays private and is
                never shown to candidates.
              </div>
            </div>
            <Input
              label="How many existing colleagues will this hire work with directly?"
              type="number"
              min={0}
              max={50}
              value={teamSize === '' ? '' : teamSize}
              onChange={(e) => setTeamSize(e.target.value === '' ? '' : Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0)))}
              placeholder="e.g. 4"
            />
            {teamMembers.length > 0 && (
              <div className="space-y-3">
                {teamMembers.map((m, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-ink-100 rounded-lg p-3">
                    <Input
                      label={`Colleague ${idx + 1} year of birth`}
                      type="number"
                      inputMode="numeric"
                      min={1950}
                      max={new Date().getFullYear()}
                      placeholder="e.g. 1985"
                      value={m.dob}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                        setTeamMembers((prev) => prev.map((p, i) => i === idx ? { ...p, dob: v } : p))
                      }}
                    />
                    <Select
                      label={`Colleague ${idx + 1} gender`}
                      value={m.gender}
                      onChange={(e) => {
                        const v = e.target.value as '' | Gender
                        setTeamMembers((prev) => prev.map((p, i) => i === idx ? { ...p, gender: v } : p))
                      }}
                    >
                      <option value="">Select…</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && <Alert tone="red">{err}</Alert>}

          <div className="flex gap-2 justify-between pt-4 border-t border-ink-100">
            <Button type="button" variant="secondary" onClick={() => navigate('/hm')} disabled={busy}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!title || requiredTraits.length === 0}>
              {busy ? 'Posting…' : 'Post role & start matching'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

function fmt(v: number | null | undefined) { return v == null ? '—' : v.toLocaleString() }
