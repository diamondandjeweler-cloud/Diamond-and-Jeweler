/**
 * HMOnboarding — AI-powered chat onboarding for hiring managers.
 *
 * Phases:
 *   basics       — structured form: name + job title (never sent to AI)
 *   chat         — Bo (Claude) HM-mode conversation, ends with [PROFILE_READY]
 *   mustHaves    — structured role constraints (checkboxes) + free-text list
 *   demographics — race, religion, languages, location (mirrors talent DOB form)
 *   hiringDetails — budget, deadline, interview rounds, salary flex, failure at 90 days
 *   dob          — structured date input (encrypted) + consent
 *   review       — summary confirmation before submit
 *   submit       — extract HM profile from transcript, update hiring_managers row
 *   done         — redirect to /hm
 *
 * PDPA: name/job title collected via form stored directly to Supabase.
 * Company names and identifiers are never collected or sent to external AI.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { encryptDob, markOnboardingComplete } from '../../lib/api'
import { getLifeChartCharacter, type Gender } from '../../lib/lifeChartCharacter'
import Consent from '../../components/Consent'
import ChatShell, { ChatMessage } from '../../components/ChatShell'
import { Button, Alert } from '../../components/ui'

type Phase = 'basics' | 'chat' | 'mustHaves' | 'demographics' | 'hiringDetails' | 'dob' | 'review' | 'submit' | 'done'

interface ApiMessage { role: 'user' | 'assistant'; content: string }

const BO_GREETING =
  "Hey! I'm Bo, your hiring buddy at DNJ. Let's start with just a few quick basics about the role — nothing heavy yet.\n\nFirst up: what role are you hiring for and which industry are you in?"

export default function HMOnboarding() {
  const { session, profile, refresh } = useSession()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('basics')
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [log, setLog] = useState<ChatMessage[]>([])
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortCtrlRef = useRef<AbortController | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  // DOB + consent
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [dobConsent, setDobConsent] = useState(false)

  // mustHaves structured checkboxes
  const [hmRequiresDrivingLicense, setHmRequiresDrivingLicense] = useState(false)
  const [hmRequiresWeekends, setHmRequiresWeekends] = useState(false)
  const [hmRequiresTravel, setHmRequiresTravel] = useState(false)
  const [hmRequiresNightShifts, setHmRequiresNightShifts] = useState(false)
  const [hmRequiresRelocation, setHmRequiresRelocation] = useState(false)
  const [hmOnsiteOnly, setHmOnsiteOnly] = useState(false)
  const [hmRequiresOwnTransport, setHmRequiresOwnTransport] = useState(false)
  const [hmHasCommission, setHmHasCommission] = useState(false)
  const [mustHaveItems, setMustHaveItems] = useState<string[]>([])
  const [mustHaveInput, setMustHaveInput] = useState('')

  // demographics
  const [race, setRace] = useState('')
  const [religion, setReligion] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [locationMatters, setLocationMatters] = useState<boolean | null>(null)
  const [locationPostcode, setLocationPostcode] = useState('')

  // hiringDetails
  const [budgetApproved, setBudgetApproved] = useState('')
  const [deadlineToFill, setDeadlineToFill] = useState('')
  const [interviewRoundsHM, setInterviewRoundsHM] = useState<number | null>(null)
  const [salaryFlex, setSalaryFlex] = useState<boolean | null>(null)
  const [failureAt90Days, setFailureAt90Days] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!isStreaming && phase === 'chat') {
      chatInputRef.current?.focus()
    }
  }, [isStreaming, phase])

  const idRef = useRef(0)
  const nextId = () => `m${++idRef.current}`
  const chatInitRef = useRef(false)
  const updatedRef = useRef(false)

  useEffect(() => {
    if (phase !== 'chat' || chatInitRef.current) return
    chatInitRef.current = true
    setLog([{ id: nextId(), from: 'system', content: BO_GREETING }])
    setApiMessages([{ role: 'assistant', content: BO_GREETING }])
  }, [phase])

  if (!session || !profile) return null

  const DiamondPointsInfo = phase === 'basics' ? (
    <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <span className="font-semibold">You get 3 free matches.</span>{' '}
      Earn Diamond Points by giving feedback, completing interviews, and referring friends — or buy more.
      {' '}<span className="font-semibold">21 pts = 1 extra match.</span>
    </div>
  ) : null

  async function sendMessage(text: string) {
    if (isStreaming || !text.trim() || phase !== 'chat') return
    const trimmed = text.trim()
    setInput('')

    setLog((l) => [...l, { id: nextId(), from: 'you', content: trimmed }])
    const newApiMsgs: ApiMessage[] = [...apiMessages, { role: 'user', content: trimmed }]
    setApiMessages(newApiMsgs)

    const boId = nextId()
    setLog((l) => [...l, { id: boId, from: 'system', content: '', typing: true }])
    setIsStreaming(true)
    let accumulated = ''

    try {
      const { data: authData } = await supabase.auth.getSession()
      const token = authData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      // Abort the whole request (connect + stream) if silent for 25s, or user clicks Stop.
      const abortCtrl = new AbortController()
      abortCtrlRef.current = abortCtrl
      let stallTimer: ReturnType<typeof setTimeout> | undefined
      const resetStall = () => {
        clearTimeout(stallTimer)
        stallTimer = setTimeout(() => abortCtrl.abort(), 25_000)
      }
      resetStall()

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-onboard`,
        {
          method: 'POST',
          signal: abortCtrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messages: newApiMsgs, mode: 'hm' }),
        },
      )
      if (!res.ok) throw new Error(`Server error ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        resetStall()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break outer
          try {
            const evt = JSON.parse(raw)
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              accumulated += evt.delta.text
              const display = accumulated.replace('[PROFILE_READY]', '').trimEnd()
              setLog((l) => l.map((m) => (m.id === boId ? { ...m, content: display, typing: false } : m)))
            }
            if (evt.type === 'message_stop') break outer
          } catch { /* skip malformed SSE lines */ }
        }
      }
      clearTimeout(stallTimer)

      const finalMsgs: ApiMessage[] = [...newApiMsgs, { role: 'assistant', content: accumulated }]
      setApiMessages(finalMsgs)

      if (accumulated.includes('[PROFILE_READY]')) {
        const savedAt = new Date().toISOString()
        Promise.all([
          supabase.from('profiles').update({ interview_transcript: { messages: finalMsgs, saved_at: savedAt } }).eq('id', session!.user.id),
          supabase.from('hiring_managers').update({ interview_answers: { transcript: finalMsgs } }).eq('profile_id', session!.user.id),
        ]).then(() => { /* best-effort */ })

        setLog((l) => [...l, {
          id: nextId(), from: 'system',
          content: "Almost done — a few quick questions about the role requirements and your background, then you're all set.",
        }])
        setTimeout(() => setPhase('mustHaves'), 600)
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (isAbort && accumulated.trim()) {
        const partialMsgs: ApiMessage[] = [...newApiMsgs, { role: 'assistant', content: accumulated }]
        setApiMessages(partialMsgs)
        const savedAt = new Date().toISOString()
        Promise.all([
          supabase.from('profiles').update({ interview_transcript: { messages: partialMsgs, saved_at: savedAt, partial: true } }).eq('id', session!.user.id),
          supabase.from('hiring_managers').update({ interview_answers: { transcript: partialMsgs } }).eq('profile_id', session!.user.id),
        ]).then(() => {})
        setLog((l) => [
          ...l.map((m) => m.id === boId ? { ...m, typing: false } : m),
          { id: nextId(), from: 'system', content: 'Progress saved. Feel free to continue whenever you\'re ready.' },
        ])
      } else if (isAbort) {
        setLog((l) => l.map((m) => m.id === boId ? { ...m, content: '', typing: false } : m))
      } else {
        setLog((l) => l.map((m) => m.id === boId ? { ...m, content: 'Something went wrong. Please try again.', typing: false } : m))
      }
    } finally {
      setIsStreaming(false)
    }
  }

  async function finalise() {
    if (!session) return
    if (updatedRef.current) { navigate('/hm', { replace: true }); return }
    setErr(null)
    setBusy(true)
    try {
      const userId = session.user.id

      const [dobEncrypted, authData] = await Promise.all([encryptDob(dob), supabase.auth.getSession()])
      const token = authData.data.session?.access_token
      if (!token) throw new Error('Not authenticated')

      if (dobConsent) {
        const nextConsents = {
          ...(profile?.consents as Record<string, unknown>),
          dob: true,
          dob_consented_at: new Date().toISOString(),
        }
        const { error: consentErr } = await supabase.from('profiles').update({ consents: nextConsents }).eq('id', userId)
        if (consentErr) throw consentErr
      }

      const extRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-hm-profile`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messages: apiMessages }),
        },
      )
      if (!extRes.ok) throw new Error(`Profile extraction failed (${extRes.status})`)
      const extracted = await extRes.json() as {
        industry: string | null
        role_type: string | null
        role_open_reason: string | null
        why_last_hire_left: string | null
        team_size: number | null
        hire_urgency: string | null
        success_at_90_days: string | null
        failure_at_90_days: string | null
        failure_pattern: string | null
        hardest_part_of_role: string | null
        work_arrangement_offered: string | null
        must_have_items: string[]
        screening_red_flags: string[]
        leadership_tags: Record<string, number>
        required_traits: string[]
        culture_offers: Record<string, number>
        salary_offer_min: number | null
        salary_offer_max: number | null
        career_growth_potential: string | null
        interview_stages: number | null
        panel_involved: boolean | null
        required_work_authorization: string[]
        summary: string | null
      }

      const { data: hmRow, error: hmErr } = await supabase.from('hiring_managers').select('id').eq('profile_id', userId).maybeSingle()
      if (hmErr) throw hmErr
      if (!hmRow) throw new Error('No hiring-manager record found for your account. Ask your HR contact to re-send the invite.')

      const lifeChartCharacter = gender ? getLifeChartCharacter(dob, gender) : null

      const { error: updateErr } = await supabase
        .from('hiring_managers')
        .update({
          date_of_birth_encrypted: dobEncrypted,
          gender: gender || null,
          life_chart_character: lifeChartCharacter,
          job_title: jobTitle.trim(),
          industry: extracted.industry,
          role_type: extracted.role_type,
          role_open_reason: extracted.role_open_reason ?? null,
          why_last_hire_left: extracted.why_last_hire_left ?? null,
          team_size: extracted.team_size ?? null,
          hire_urgency: extracted.hire_urgency ?? null,
          success_at_90_days: extracted.success_at_90_days ?? null,
          // Form value takes precedence over chat-extracted failure description
          failure_at_90_days: failureAt90Days.trim() || extracted.failure_at_90_days || null,
          screening_red_flags: [
            ...(extracted.screening_red_flags ?? []),
            ...(extracted.failure_pattern ? [`Failure pattern: ${extracted.failure_pattern}`] : []),
          ].filter(Boolean).length > 0
            ? [
                ...(extracted.screening_red_flags ?? []),
                ...(extracted.failure_pattern ? [`Failure pattern: ${extracted.failure_pattern}`] : []),
              ].filter(Boolean)
            : null,
          hardest_part_of_role: extracted.hardest_part_of_role ?? null,
          work_arrangement_offered: extracted.work_arrangement_offered ?? null,
          leadership_tags: extracted.leadership_tags,
          required_traits: extracted.required_traits,
          culture_offers: extracted.culture_offers,
          salary_offer_min: extracted.salary_offer_min,
          salary_offer_max: extracted.salary_offer_max,
          salary_flex: salaryFlex,
          ai_summary: extracted.summary,
          interview_answers: { transcript: apiMessages },
          must_haves: { items: mustHaveItems },
          must_have_items: extracted.must_have_items?.length ? extracted.must_have_items : (mustHaveItems.length ? mustHaveItems : null),
          career_growth_potential: extracted.career_growth_potential ?? null,
          // Form value takes precedence over chat-extracted interview stages
          interview_stages: interviewRoundsHM ?? extracted.interview_stages ?? null,
          panel_involved: extracted.panel_involved ?? null,
          required_work_authorization: extracted.required_work_authorization?.length ? extracted.required_work_authorization : null,
          // Demographics (new)
          race: race || null,
          religion: religion || null,
          languages: languages.length > 0 ? languages : null,
          location_matters: locationMatters === true,
          location_postcode: locationMatters && locationPostcode.trim() ? locationPostcode.trim() : null,
          // Hiring process details (new)
          budget_approved: budgetApproved || null,
          deadline_to_fill: deadlineToFill || null,
          // Role operational constraints (new) — mirrors talent deal_breakers structure
          role_constraints: {
            requires_driving_license: hmRequiresDrivingLicense,
            requires_weekends: hmRequiresWeekends,
            requires_travel: hmRequiresTravel,
            requires_night_shifts: hmRequiresNightShifts,
            requires_relocation: hmRequiresRelocation,
            onsite_only: hmOnsiteOnly,
            requires_own_transport: hmRequiresOwnTransport,
            has_commission: hmHasCommission,
          },
        })
        .eq('id', hmRow.id)
      if (updateErr) throw updateErr
      updatedRef.current = true

      const { error: profErr } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', userId)
      if (profErr) throw profErr

      await markOnboardingComplete(userId)
      await refresh()
      setPhase('done')
      setTimeout(() => navigate('/hm', { replace: true }), 1400)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // ── composer per phase ────────────────────────────────────────────────────────

  const composer = (() => {
    if (phase === 'basics') {
      return (
        <form
          onSubmit={(e) => { e.preventDefault(); if (fullName.trim() && jobTitle.trim()) setPhase('chat') }}
          className="space-y-3"
        >
          <p className="text-sm text-ink-600">
            Before we start — just your name and job title. These stay on our servers and are never shared with AI systems.
          </p>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Full name</label>
            <input
              type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name" autoFocus
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Job title</label>
            <input
              type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Operations Manager, Hiring Manager"
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <Button type="submit" disabled={!fullName.trim() || !jobTitle.trim()} className="w-full" size="lg">
            Continue to chat with DNJ
          </Button>
        </form>
      )
    }

    if (phase === 'chat') {
      return (
        <form
          onSubmit={(e) => { e.preventDefault(); void sendMessage(input) }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={chatInputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input) } }}
            placeholder={isStreaming ? 'BoLe is typing…' : 'Type your message… (Shift + Enter for new line)'}
            rows={2} disabled={isStreaming}
            className="flex-1 resize-none rounded-xl border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50"
            autoFocus
          />
          {isStreaming ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => abortCtrlRef.current?.abort()}>Stop</Button>
          ) : (
            <Button type="submit" disabled={!input.trim()} size="sm">Send</Button>
          )}
        </form>
      )
    }

    if (phase === 'mustHaves') {
      function addItem() {
        const t = mustHaveInput.trim()
        if (!t || mustHaveItems.includes(t)) return
        setMustHaveItems((prev) => [...prev, t])
        setMustHaveInput('')
      }
      const structuredItems = [
        { state: hmRequiresDrivingLicense, setter: setHmRequiresDrivingLicense, label: 'Role requires own driving licence / transport' },
        { state: hmRequiresWeekends,       setter: setHmRequiresWeekends,       label: 'Weekend work required' },
        { state: hmRequiresTravel,         setter: setHmRequiresTravel,         label: 'Frequent travel required (>50% of time)' },
        { state: hmRequiresNightShifts,    setter: setHmRequiresNightShifts,    label: 'Shift work or night shifts involved' },
        { state: hmRequiresRelocation,     setter: setHmRequiresRelocation,     label: 'Candidate must be willing to relocate' },
        { state: hmOnsiteOnly,             setter: setHmOnsiteOnly,             label: 'On-site only — no hybrid or remote' },
        { state: hmRequiresOwnTransport,   setter: setHmRequiresOwnTransport,   label: 'Candidate must have own car / transport' },
        { state: hmHasCommission,          setter: setHmHasCommission,          label: 'Role includes commission or variable pay component' },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            Candidates who don't meet these requirements will be automatically excluded from your results.
          </p>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Role constraints (auto-matched)</p>
            {structuredItems.map(({ state, setter, label }) => (
              <label key={label} className="flex items-center gap-3 border border-ink-200 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 transition-colors">
                <input
                  type="checkbox" checked={state} onChange={(e) => setter(e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 accent-brand-500"
                />
                <span className="text-sm text-ink-800">{label}</span>
              </label>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Additional requirements (optional)</p>
            <p className="text-xs text-ink-400 mb-2">e.g. "Must speak fluent Mandarin", "Degree required", "Min 3 years sales experience"</p>
            <div className="flex gap-2">
              <input
                type="text" value={mustHaveInput} onChange={(e) => setMustHaveInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                placeholder="Type a requirement and press Enter or Add"
                className="flex-1 border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
              <button
                type="button" onClick={addItem} disabled={!mustHaveInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white disabled:opacity-40 hover:bg-brand-600 transition-colors shrink-0"
              >Add</button>
            </div>
          </div>

          {mustHaveItems.length > 0 && (
            <ul className="space-y-2">
              {mustHaveItems.map((item) => (
                <li key={item} className="flex items-start gap-2 bg-ink-50 border border-ink-200 rounded-lg px-3 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0 mt-1.5" />
                  <span className="flex-1 text-sm text-ink-800">{item}</span>
                  <button
                    type="button" onClick={() => setMustHaveItems((prev) => prev.filter((i) => i !== item))}
                    className="text-ink-400 hover:text-red-500 transition-colors shrink-0 text-base leading-none" aria-label="Remove"
                  >×</button>
                </li>
              ))}
            </ul>
          )}

          <Button onClick={() => setPhase('demographics')} className="w-full" size="lg">Continue</Button>
        </div>
      )
    }

    if (phase === 'demographics') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            A few quick details about you — used by our compatibility matching engine. Encrypted and never shown to candidates.
          </p>
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Race / ethnicity:</p>
            <div className="grid grid-cols-2 gap-2">
              {(['Malay', 'Chinese', 'Indian', 'Others'] as const).map((r) => (
                <button
                  key={r} type="button" onClick={() => setRace(r.toLowerCase())}
                  className={`border rounded-lg px-3 py-2 text-sm ${race === r.toLowerCase() ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
                >{r}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Religion:</p>
            <select
              value={religion} onChange={(e) => setReligion(e.target.value)}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">Select...</option>
              <option value="islam">Islam</option>
              <option value="christianity">Christianity</option>
              <option value="buddhism">Buddhism</option>
              <option value="hinduism">Hinduism</option>
              <option value="taoism">Taoism</option>
              <option value="chinese_folk">Chinese Folk Religion</option>
              <option value="no_religion">No religion / Atheist</option>
              <option value="others">Others</option>
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Languages you speak (select all that apply):</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'english',          label: 'English' },
                { value: 'bahasa_malaysia',  label: 'Bahasa Malaysia' },
                { value: 'mandarin',         label: 'Mandarin' },
                { value: 'cantonese',        label: 'Cantonese' },
                { value: 'hokkien',          label: 'Hokkien' },
                { value: 'hakka',            label: 'Hakka' },
                { value: 'teochew',          label: 'Teochew' },
                { value: 'tamil',            label: 'Tamil' },
                { value: 'others',           label: 'Others' },
              ].map(({ value, label }) => {
                const active = languages.includes(value)
                return (
                  <button
                    key={value} type="button"
                    onClick={() => setLanguages((prev) => active ? prev.filter((l) => l !== value) : [...prev, value])}
                    className={`border rounded-full px-3 py-1.5 text-xs ${active ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
                  >{label}</button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Is the role location-specific?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setLocationMatters(true)}
                className={`border rounded-lg px-3 py-2 text-sm ${locationMatters === true ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >Yes — specific area</button>
              <button
                type="button" onClick={() => { setLocationMatters(false); setLocationPostcode('') }}
                className={`border rounded-lg px-3 py-2 text-sm ${locationMatters === false ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >No — open location</button>
            </div>
            {locationMatters === true && (
              <input
                type="text" inputMode="numeric" pattern="[0-9]{5}" maxLength={5}
                value={locationPostcode} onChange={(e) => setLocationPostcode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Office postcode (5 digits)"
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>
          <Button
            onClick={() => setPhase('hiringDetails')}
            disabled={!race || !religion || languages.length === 0 || locationMatters === null || (locationMatters === true && locationPostcode.length !== 5)}
            className="w-full" size="lg"
          >Continue</Button>
        </div>
      )
    }

    if (phase === 'hiringDetails') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            A few process details that help us prioritise and match correctly.
          </p>

          {/* Budget */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink-700">Has budget been approved for this hire?</p>
            <div className="grid grid-cols-3 gap-2">
              {(['yes', 'pending', 'unknown'] as const).map((v) => (
                <button
                  key={v} type="button" onClick={() => setBudgetApproved(v)}
                  className={`border rounded-lg px-3 py-2 text-sm capitalize ${budgetApproved === v ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
                >{v === 'yes' ? 'Yes ✓' : v === 'pending' ? 'Pending' : 'Unknown'}</button>
              ))}
            </div>
            {budgetApproved === 'pending' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
                We'll hold shortlisting until you confirm budget is approved.
              </p>
            )}
          </div>

          {/* Deadline */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-ink-700">Deadline to fill (optional)</label>
            <input
              type="date" value={deadlineToFill} onChange={(e) => setDeadlineToFill(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Interview rounds */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink-700">How many interview rounds?</p>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n} type="button" onClick={() => setInterviewRoundsHM(n)}
                  className={`border rounded-lg px-3 py-2 text-sm ${interviewRoundsHM === n ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
                >{n}{n === 4 ? '+' : ''}</button>
              ))}
            </div>
          </div>

          {/* Salary flex */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink-700">Is the salary range flexible for an exceptional candidate?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setSalaryFlex(true)}
                className={`border rounded-lg px-3 py-2 text-sm ${salaryFlex === true ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >Yes — negotiable</button>
              <button
                type="button" onClick={() => setSalaryFlex(false)}
                className={`border rounded-lg px-3 py-2 text-sm ${salaryFlex === false ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >No — fixed band</button>
            </div>
          </div>

          {/* Failure at 90 days */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-ink-700">
              What does failure look like at 90 days? <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <p className="text-xs text-ink-400">e.g. "Unable to close first deal independently", "Still asking basic process questions"</p>
            <textarea
              value={failureAt90Days} onChange={(e) => setFailureAt90Days(e.target.value)}
              rows={3} placeholder="Describe what a disappointing first 90 days would look like…"
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <Button onClick={() => setPhase('dob')} className="w-full" size="lg">Continue</Button>
        </div>
      )
    }

    if (phase === 'dob') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Your date of birth is encrypted and only used by our compatibility matching engine. Candidates never see it.
          </p>
          <input
            type="date" value={dob} onChange={(e) => setDob(e.target.value)}
            max={new Date(Date.now() - 18 * 365 * 86400000).toISOString().slice(0, 10)}
            className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Gender (used by the matching engine alongside DOB):</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setGender('male')}
                className={`border rounded-lg px-3 py-2 text-sm ${gender === 'male' ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >Male</button>
              <button
                type="button" onClick={() => setGender('female')}
                className={`border rounded-lg px-3 py-2 text-sm ${gender === 'female' ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >Female</button>
            </div>
          </div>
          <Consent
            checked={dobConsent} onChange={setDobConsent}
            label="I consent to DNJ collecting my date of birth for advanced AI-powered compatibility analysis. It will be encrypted and never disclosed to candidates."
            required
          />
          {err && <Alert tone="red">{err}</Alert>}
          <Button
            onClick={() => setPhase('review')}
            disabled={!dob || !gender || !dobConsent}
            className="w-full" size="lg"
          >Review &amp; confirm</Button>
        </div>
      )
    }

    if (phase === 'review') {
      const activeConstraints = [
        hmRequiresDrivingLicense && 'Driving licence required',
        hmRequiresWeekends       && 'Weekend work',
        hmRequiresTravel         && 'Frequent travel',
        hmRequiresNightShifts    && 'Shift / night work',
        hmRequiresRelocation     && 'Relocation required',
        hmOnsiteOnly             && 'On-site only',
        hmRequiresOwnTransport   && 'Own transport required',
        hmHasCommission          && 'Commission component',
      ].filter(Boolean) as string[]

      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            Here's what we've captured. Review before we build your hiring profile.
          </p>

          <HMReviewRow label="Chat" value="Completed ✓" ok />
          <HMReviewRow label="Date of birth" value={dob ? `${dob} (encrypted)` : '—'} ok={!!dob} />
          <HMReviewRow label="Gender" value={gender || '—'} ok={!!gender} />
          <HMReviewRow label="Race" value={race || '—'} ok={!!race} />
          <HMReviewRow label="Religion" value={religion || '—'} ok={!!religion} />
          <HMReviewRow label="Languages" value={languages.length > 0 ? languages.join(', ') : '—'} ok={languages.length > 0} />
          <HMReviewRow label="Office location" value={locationMatters === true ? `Postcode ${locationPostcode}` : locationMatters === false ? 'Open location' : '—'} ok={locationMatters !== null} />
          <HMReviewRow label="Role constraints" value={activeConstraints.length > 0 ? activeConstraints.join(' · ') : 'None set'} ok />
          {mustHaveItems.length > 0 && <HMReviewRow label="Additional requirements" value={mustHaveItems.join(' · ')} ok />}
          <HMReviewRow label="Budget approved" value={budgetApproved || 'Not specified'} ok={!!budgetApproved} />
          {deadlineToFill && <HMReviewRow label="Deadline to fill" value={deadlineToFill} ok />}
          {interviewRoundsHM != null && <HMReviewRow label="Interview rounds" value={String(interviewRoundsHM)} ok />}
          {salaryFlex != null && <HMReviewRow label="Salary flexibility" value={salaryFlex ? 'Negotiable' : 'Fixed band'} ok />}
          {failureAt90Days && <HMReviewRow label="Failure at 90 days" value={failureAt90Days} ok />}

          {err && <Alert tone="red">{err}</Alert>}
          <Button onClick={() => { setPhase('submit'); void finalise() }} loading={busy} className="w-full" size="lg">
            Build my hiring profile
          </Button>
          <button
            type="button" onClick={() => setPhase('dob')}
            className="w-full text-xs text-ink-400 hover:text-ink-600 py-1"
          >← Go back and change something</button>
        </div>
      )
    }

    if (phase === 'submit') {
      return (
        <div className="space-y-2 text-center">
          {err ? (
            <>
              <Alert tone="red">{err}</Alert>
              <Button onClick={() => setPhase('dob')} className="w-full">Back</Button>
            </>
          ) : (
            <p className="text-sm text-ink-500 py-3 animate-pulse">Building your hiring profile…</p>
          )}
        </div>
      )
    }

    return <div />
  })()

  if (phase === 'done') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <h1 className="text-2xl font-bold mb-2">Welcome aboard!</h1>
        <p className="text-ink-600">Taking you to your hiring dashboard…</p>
      </div>
    )
  }

  const headline =
    phase === 'basics'       ? 'About you' :
    phase === 'chat'         ? 'Chat with DNJ' :
    phase === 'mustHaves'    ? 'Role requirements' :
    phase === 'demographics' ? 'About you' :
    phase === 'hiringDetails'? 'Hiring details' :
    phase === 'dob'          ? 'Date of birth' :
    phase === 'review'       ? 'Review your profile' :
    phase === 'submit'       ? 'Finishing up…' : ''

  const progressPct =
    phase === 'basics'       ? 5  :
    phase === 'chat'         ? 40 :
    phase === 'mustHaves'    ? 55 :
    phase === 'demographics' ? 68 :
    phase === 'hiringDetails'? 78 :
    phase === 'dob'          ? 88 :
    phase === 'review'       ? 94 :
    phase === 'submit'       ? 97 : 100

  return (
    <>
      {DiamondPointsInfo}
      <ChatShell messages={log} input={composer} headline={headline} progressPct={progressPct} formMode={phase !== 'chat'} />
    </>
  )
}

// ── HMReviewRow ───────────────────────────────────────────────────────────────

function HMReviewRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start gap-3 border border-ink-100 rounded-lg px-3 py-2 bg-white">
      <span className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center shrink-0 text-xs ${ok ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
        {ok ? '✓' : '!'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ink-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-ink-800 break-words">{value}</p>
      </div>
    </div>
  )
}
