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
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { insertRole } from '../../data/repositories/roles'
import { encryptDob, markOnboardingComplete } from '../../lib/api'
import { callFunction } from '../../lib/functions'
import { getLifeChartCharacter, type Gender } from '../../lib/lifeChartCharacter'
import Consent from '../../components/Consent'
import ChatShell, { ChatMessage } from '../../components/ChatShell'
import { Button, Alert } from '../../components/ui'

type Phase = 'basics' | 'chat' | 'mustHaves' | 'demographics' | 'hiringDetails' | 'dob' | 'review' | 'submit' | 'done'

interface ApiMessage { role: 'user' | 'assistant'; content: string }

export default function HMOnboarding() {
  const { t } = useTranslation()
  const { session, profile, refresh } = useSession()
  const navigate = useNavigate()

  const BO_GREETING = t('hmOnboard.boGreeting')

  const [phase, setPhase] = useState<Phase>('basics')
  const [switching, setSwitching] = useState(false)
  const [switchErr, setSwitchErr] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [log, setLog] = useState<ChatMessage[]>([])
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortCtrlRef = useRef<AbortController | null>(null)
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Abort any in-flight SSE stream and clear any pending phase timer when the component unmounts.
  useEffect(() => () => {
    abortCtrlRef.current?.abort()
    if (phaseTimerRef.current !== null) clearTimeout(phaseTimerRef.current)
  }, [])
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  // DOB + consent
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [dobConsent, setDobConsent] = useState(false)
  const [dobSkipPrompt, setDobSkipPrompt] = useState(false)
  const [dobSkipped, setDobSkipped] = useState(false)

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
  const [hmMissing, setHmMissing] = useState(false)

  // Preflight: verify hiring_managers row exists — if missing, try to self-heal by
  // finding the user's company and inserting the row. Only show the error if there
  // is genuinely no company to link to (truly uninvited / un-registered user).
  useEffect(() => {
    if (!session?.user.id) return
    const userId = session.user.id
    let mounted = true

    async function preflight() {
      const { data: hmRow } = await supabase
        .from('hiring_managers')
        .select('id')
        .eq('profile_id', userId)
        .maybeSingle()

      if (hmRow) return // all good

      // No HM row — try to find a company this user owns
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('created_by', userId)
        .maybeSingle()

      if (!company) {
        // Also try primary_hr_email match
        const { data: prof } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .maybeSingle()
        if (prof?.email) {
          const { data: companyByEmail } = await supabase
            .from('companies')
            .select('id')
            .eq('primary_hr_email', prof.email)
            .maybeSingle()
          if (companyByEmail) {
            await supabase.from('hiring_managers').upsert(
              { profile_id: userId, company_id: companyByEmail.id, job_title: 'Hiring Manager' },
              { onConflict: 'profile_id' },
            )
            return // healed
          }
        }
        if (mounted) setHmMissing(true) // no company at all — show error
        return
      }

      // Found a company — insert the missing HM row silently
      await supabase.from('hiring_managers').upsert(
        { profile_id: userId, company_id: company.id, job_title: 'Hiring Manager' },
        { onConflict: 'profile_id' },
      )
      // healed — no error shown, onboarding proceeds
    }

    void preflight()
    return () => { mounted = false }
  }, [session?.user.id])

  useEffect(() => {
    if (!isStreaming && phase === 'chat') {
      chatInputRef.current?.focus()
    }
  }, [isStreaming, phase])

  const idRef = useRef(0)
  const nextId = () => `m${++idRef.current}`
  const conversationIdRef = useRef<string>(crypto.randomUUID())
  const chatInitRef = useRef(false)
  const updatedRef = useRef(false)
  const inFlightRef = useRef(false)
  const draftCheckRef = useRef(false)
  const draftKey = session ? `dnj.hm-onboard.${session.user.id}` : null

  // On mount: restore all saved progress from localStorage.
  useEffect(() => {
    if (!session?.user.id || draftCheckRef.current) return
    draftCheckRef.current = true
    const raw = draftKey ? localStorage.getItem(draftKey) : null
    if (!raw) return
    try {
      const d = JSON.parse(raw) as {
        phase?: Phase; fullName?: string; jobTitle?: string; apiMessages?: ApiMessage[]
        mustHaveItems?: string[]
        hmRequiresDrivingLicense?: boolean; hmRequiresWeekends?: boolean; hmRequiresTravel?: boolean
        hmRequiresNightShifts?: boolean; hmRequiresRelocation?: boolean; hmOnsiteOnly?: boolean
        hmRequiresOwnTransport?: boolean; hmHasCommission?: boolean
        race?: string; religion?: string; languages?: string[]
        locationMatters?: boolean | null; locationPostcode?: string
        budgetApproved?: string; deadlineToFill?: string; interviewRoundsHM?: number | null
        salaryFlex?: boolean | null; failureAt90Days?: string
      }
      if (d.fullName) setFullName(d.fullName)
      if (d.jobTitle) setJobTitle(d.jobTitle)
      if (d.mustHaveItems?.length) setMustHaveItems(d.mustHaveItems)
      if (d.hmRequiresDrivingLicense) setHmRequiresDrivingLicense(d.hmRequiresDrivingLicense)
      if (d.hmRequiresWeekends) setHmRequiresWeekends(d.hmRequiresWeekends)
      if (d.hmRequiresTravel) setHmRequiresTravel(d.hmRequiresTravel)
      if (d.hmRequiresNightShifts) setHmRequiresNightShifts(d.hmRequiresNightShifts)
      if (d.hmRequiresRelocation) setHmRequiresRelocation(d.hmRequiresRelocation)
      if (d.hmOnsiteOnly) setHmOnsiteOnly(d.hmOnsiteOnly)
      if (d.hmRequiresOwnTransport) setHmRequiresOwnTransport(d.hmRequiresOwnTransport)
      if (d.hmHasCommission) setHmHasCommission(d.hmHasCommission)
      if (d.race) setRace(d.race)
      if (d.religion) setReligion(d.religion)
      if (d.languages?.length) setLanguages(d.languages)
      if (d.locationMatters != null) setLocationMatters(d.locationMatters)
      if (d.locationPostcode) setLocationPostcode(d.locationPostcode)
      if (d.budgetApproved) setBudgetApproved(d.budgetApproved)
      if (d.deadlineToFill) setDeadlineToFill(d.deadlineToFill)
      if (d.interviewRoundsHM != null) setInterviewRoundsHM(d.interviewRoundsHM)
      if (d.salaryFlex != null) setSalaryFlex(d.salaryFlex)
      if (d.failureAt90Days) setFailureAt90Days(d.failureAt90Days)
      if (d.apiMessages && d.apiMessages.length > 1) {
        setApiMessages(d.apiMessages)
        setLog(d.apiMessages.map((m, i) => ({
          id: `r${i}`,
          from: (m.role === 'assistant' ? 'system' : 'you') as 'system' | 'you',
          content: m.content.replace('[PROFILE_READY]', '').trim(),
        })))
        chatInitRef.current = true
        setPhase(d.phase && d.phase !== 'basics' && d.phase !== 'done' && d.phase !== 'submit' ? d.phase : 'chat')
      } else if (d.phase && d.phase !== 'basics' && d.phase !== 'done' && d.phase !== 'submit') {
        setPhase(d.phase)
      }
    } catch { /* ignore */ }
  }, [session?.user.id, draftKey])

  // Autosave all form state on every change — DOB intentionally excluded (never in plaintext).
  // 'basics' is intentionally included so a crash before form submit doesn't wipe fullName/jobTitle.
  // apiMessages included: after [PROFILE_READY] wipes the draft, the autosave at mustHaves/later phases
  // preserves the transcript so finalise() never submits empty messages on crash-and-restore.
  useEffect(() => {
    if (!draftKey || phase === 'done' || phase === 'submit') return
    try {
      const prev = JSON.parse(localStorage.getItem(draftKey) || '{}') as Record<string, unknown>
      localStorage.setItem(draftKey, JSON.stringify({
        ...prev,
        phase, fullName, jobTitle,
        ...(apiMessages.length > 1 ? { apiMessages } : {}),
        mustHaveItems,
        hmRequiresDrivingLicense, hmRequiresWeekends, hmRequiresTravel,
        hmRequiresNightShifts, hmRequiresRelocation, hmOnsiteOnly,
        hmRequiresOwnTransport, hmHasCommission,
        race, religion, languages, locationMatters, locationPostcode,
        budgetApproved, deadlineToFill, interviewRoundsHM, salaryFlex, failureAt90Days,
      }))
    } catch { /* ignore storage errors */ }
  }, [
    draftKey, phase, fullName, jobTitle, apiMessages,
    mustHaveItems,
    hmRequiresDrivingLicense, hmRequiresWeekends, hmRequiresTravel,
    hmRequiresNightShifts, hmRequiresRelocation, hmOnsiteOnly,
    hmRequiresOwnTransport, hmHasCommission,
    race, religion, languages, locationMatters, locationPostcode,
    budgetApproved, deadlineToFill, interviewRoundsHM, salaryFlex, failureAt90Days,
  ])

  useEffect(() => {
    if (phase !== 'chat' || chatInitRef.current) return
    chatInitRef.current = true
    setLog([{ id: nextId(), from: 'system', content: BO_GREETING }])
    setApiMessages([{ role: 'assistant', content: BO_GREETING }])
  }, [phase])

  if (!session || !profile) return null

  if (hmMissing) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-4">
        <Alert tone="red">
          {t('hmOnboard.noHmRecord')}
        </Alert>
        <Button className="w-full" onClick={() => navigate(-1)}>{t('common.back')}</Button>
      </div>
    </div>
  )

  const DiamondPointsInfo = phase === 'basics' ? (
    <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <span className="font-semibold">{t('hmOnboard.diamondPointsInfo')}</span>
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

    // Show a soft warning after 10s if no chunk has arrived yet.
    const warnMsgId = nextId()
    let warnCleared = false
    let warnTimer: ReturnType<typeof setTimeout> | undefined
    const clearWarn = () => {
      if (warnCleared) return
      warnCleared = true
      clearTimeout(warnTimer)
      setLog((l) => l.filter((m) => m.id !== warnMsgId))
    }

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

      warnTimer = setTimeout(() => {
        setLog((l) => [...l, {
          id: warnMsgId, from: 'system',
          content: t('hmOnboard.chatSlowWarning'),
        }])
      }, 10_000)

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-onboard`,
        {
          method: 'POST',
          signal: abortCtrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messages: newApiMsgs, mode: 'hm', conversation_id: conversationIdRef.current }),
        },
      )
      if (!res.ok) throw new Error(`Server error ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      outer: for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        clearWarn()
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
              const display = accumulated.includes('[PROFILE_READY]')
                ? accumulated.replace('[PROFILE_READY]', '').trimEnd()
                : accumulated.replace(/\[PROFILE_[A-Z_\]]*$/, '').trimEnd()
              setLog((l) => l.map((m) => (m.id === boId ? { ...m, content: display, typing: false } : m)))
            }
            if (evt.type === 'message_stop') break outer
          } catch { /* skip malformed SSE lines */ }
        }
      }
      clearTimeout(stallTimer)

      const finalMsgs: ApiMessage[] = [...newApiMsgs, { role: 'assistant', content: accumulated }]
      setApiMessages(finalMsgs)

      if (draftKey) {
        try {
          if (accumulated.includes('[PROFILE_READY]')) {
            localStorage.removeItem(draftKey)
          } else {
            localStorage.setItem(draftKey, JSON.stringify({ fullName, jobTitle, apiMessages: finalMsgs }))
          }
        } catch { /* ignore */ }
      }

      if (accumulated.includes('[PROFILE_READY]')) {
        const savedAt = new Date().toISOString()
        Promise.all([
          supabase.from('profiles').update({ interview_transcript: { messages: finalMsgs, saved_at: savedAt } }).eq('id', session!.user.id),
          supabase.from('hiring_managers').update({ interview_answers: { transcript: finalMsgs } }).eq('profile_id', session!.user.id),
        ]).then(() => { /* best-effort */ })

        setLog((l) => [...l, {
          id: nextId(), from: 'system',
          content: t('hmOnboard.chatAlmostDone'),
        }])
        phaseTimerRef.current = setTimeout(() => setPhase('mustHaves'), 600)
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (isAbort && accumulated.trim()) {
        const partialMsgs: ApiMessage[] = [...newApiMsgs, { role: 'assistant', content: accumulated }]
        setApiMessages(partialMsgs)
        if (draftKey) {
          try { localStorage.setItem(draftKey, JSON.stringify({ fullName, jobTitle, apiMessages: partialMsgs })) } catch { /* ignore */ }
        }
        const savedAt = new Date().toISOString()
        Promise.all([
          supabase.from('profiles').update({ interview_transcript: { messages: partialMsgs, saved_at: savedAt, partial: true } }).eq('id', session!.user.id),
          supabase.from('hiring_managers').update({ interview_answers: { transcript: partialMsgs } }).eq('profile_id', session!.user.id),
        ]).then(() => {})
        setLog((l) => [
          ...l.map((m) => m.id === boId ? { ...m, typing: false } : m),
          { id: nextId(), from: 'system', content: t('hmOnboard.chatProgressSaved') },
        ])
      } else if (isAbort) {
        setLog((l) => l.map((m) => m.id === boId ? { ...m, content: '', typing: false } : m))
      } else {
        setLog((l) => l.map((m) => m.id === boId ? { ...m, content: t('hmOnboard.chatError'), typing: false } : m))
      }
    } finally {
      clearWarn()
      setIsStreaming(false)
    }
  }

  async function finalise() {
    if (!session) return
    if (updatedRef.current) { navigate('/hm', { replace: true }); return }
    if (inFlightRef.current) return  // synchronous guard — prevents double-submit from rapid clicks
    inFlightRef.current = true
    setErr(null)
    setBusy(true)
    try {
      const userId = session.user.id

      const [dobEncrypted, authData] = await Promise.all([
        dob ? encryptDob(dob) : Promise.resolve(null),
        supabase.auth.getSession(),
      ])
      const token = authData.data.session?.access_token
      if (!token) throw new Error('Not authenticated')

      if (dob && dobConsent) {
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
        error?: string
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
      if (extracted.error) throw new Error(`Profile extraction failed: ${extracted.error}`)

      const { data: hmRow, error: hmErr } = await supabase.from('hiring_managers').select('id').eq('profile_id', userId).maybeSingle()
      if (hmErr) throw hmErr
      if (!hmRow) throw new Error(t('hmOnboard.noHmRecord'))

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

      const { error: profErr } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', userId)
      if (profErr) throw profErr

      // Auto-create a draft role from chat data so the HM doesn't re-enter everything.
      // Only insert if no paused onboarding draft already exists (idempotent on retry).
      if (extracted.role_type) {
        const { data: existingDraft } = await supabase.from('roles')
          .select('id').eq('hiring_manager_id', hmRow.id).eq('from_onboarding', true).eq('status', 'paused').maybeSingle()
        if (!existingDraft) {
          const workArr = (() => {
            const w = (extracted.work_arrangement_offered ?? '').toLowerCase()
            if (w.includes('remote')) return 'remote'
            if (w.includes('hybrid')) return 'hybrid'
            return 'onsite'
          })()
          await insertRole({
            hiring_manager_id: hmRow.id,
            title: extracted.role_type,
            industry: extracted.industry ?? null,
            salary_min: extracted.salary_offer_min ?? null,
            salary_max: extracted.salary_offer_max ?? null,
            work_arrangement: workArr,
            required_traits: extracted.required_traits ?? [],
            eligibility_work_auth: extracted.required_work_authorization?.length ? extracted.required_work_authorization : [],
            status: 'paused',
            from_onboarding: true,
          })
        }
      }

      await markOnboardingComplete(userId)
      await refresh()
      if (draftKey) try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      // Mark complete only after ALL steps succeed so a retry never shortcuts
      // past profiles.update / markOnboardingComplete (mirrors TalentOnboarding fix).
      updatedRef.current = true
      setPhase('done')
      setTimeout(() => navigate('/hm', { replace: true }), 1400)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
      setBusy(false)
    }
  }

  async function handleSwitchToTalent() {
    setSwitching(true)
    setSwitchErr(null)
    try {
      await callFunction('switch-account-type', { new_role: 'talent' })
      await refresh()
      navigate('/onboarding/talent')
    } catch (e) {
      setSwitchErr(e instanceof Error ? e.message : t('hmOnboard.switchFailed'))
      setSwitching(false)
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
            {t('hmOnboard.basicsIntro')}
          </p>
          <div>
            <label htmlFor="hm-onboard-full-name" className="block text-sm font-medium text-ink-700 mb-1">{t('common.fullName')}</label>
            <input
              id="hm-onboard-full-name"
              type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder={t('hmOnboard.fullNamePlaceholder')}
              // First field of the onboarding step; autoFocus mirrors a fresh wizard arrival.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="hm-onboard-job-title" className="block text-sm font-medium text-ink-700 mb-1">{t('hmOnboard.jobTitleLabel')}</label>
            <input
              id="hm-onboard-job-title"
              type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
              placeholder={t('hmOnboard.jobTitlePlaceholder')}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <Button type="submit" disabled={!fullName.trim() || !jobTitle.trim()} className="w-full" size="lg">
            {t('hmOnboard.continueToChat')}
          </Button>
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => void handleSwitchToTalent()}
              disabled={switching}
              className="text-xs text-ink-400 hover:text-ink-600 underline"
            >
              {switching ? t('hmOnboard.switching') : t('hmOnboard.switchToTalent')}
            </button>
            {switchErr && <p className="text-xs text-red-600 mt-1">{switchErr}</p>}
          </div>
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
            placeholder={isStreaming ? t('hmOnboard.chatTyping') : t('hmOnboard.chatPlaceholder')}
            rows={2} disabled={isStreaming}
            className="flex-1 resize-none rounded-xl border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50"
            // Active chat surface — autoFocus when entering this step is intentional.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {isStreaming ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => abortCtrlRef.current?.abort()}>{t('hmOnboard.stop')}</Button>
          ) : (
            <Button type="submit" disabled={!input.trim()} size="sm">{t('common.send')}</Button>
          )}
        </form>
      )
    }

    if (phase === 'mustHaves') {
      const addItem = () => {
        const t = mustHaveInput.trim()
        if (!t || mustHaveItems.includes(t)) return
        setMustHaveItems((prev) => [...prev, t])
        setMustHaveInput('')
      }
      const structuredItems = [
        { state: hmRequiresDrivingLicense, setter: setHmRequiresDrivingLicense, label: t('hmOnboard.constraintDrivingLicense') },
        { state: hmRequiresWeekends,       setter: setHmRequiresWeekends,       label: t('hmOnboard.constraintWeekends') },
        { state: hmRequiresTravel,         setter: setHmRequiresTravel,         label: t('hmOnboard.constraintTravel') },
        { state: hmRequiresNightShifts,    setter: setHmRequiresNightShifts,    label: t('hmOnboard.constraintNightShifts') },
        { state: hmRequiresRelocation,     setter: setHmRequiresRelocation,     label: t('hmOnboard.constraintRelocation') },
        { state: hmOnsiteOnly,             setter: setHmOnsiteOnly,             label: t('hmOnboard.constraintOnsiteOnly') },
        { state: hmRequiresOwnTransport,   setter: setHmRequiresOwnTransport,   label: t('hmOnboard.constraintOwnTransport') },
        { state: hmHasCommission,          setter: setHmHasCommission,          label: t('hmOnboard.constraintCommission') },
      ]
      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            {t('hmOnboard.mustHavesIntro')}
          </p>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">{t('hmOnboard.roleConstraintsHeading')}</p>
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
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">{t('hmOnboard.additionalReqHeading')}</p>
            <p className="text-xs text-ink-400 mb-2">{t('hmOnboard.additionalReqHint')}</p>
            <div className="flex gap-2">
              <input
                type="text" value={mustHaveInput} onChange={(e) => setMustHaveInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                placeholder={t('hmOnboard.additionalReqPlaceholder')}
                className="flex-1 border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                // Wizard step surfaces this input front and centre; intentional focus.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              <button
                type="button" onClick={addItem} disabled={!mustHaveInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white disabled:opacity-40 hover:bg-brand-600 transition-colors shrink-0"
              >{t('hmOnboard.add')}</button>
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
                    className="text-ink-400 hover:text-red-500 transition-colors shrink-0 text-base leading-none" aria-label={t('hmOnboard.remove')}
                  >×</button>
                </li>
              ))}
            </ul>
          )}

          <Button onClick={() => setPhase('demographics')} className="w-full" size="lg">{t('common.continue')}</Button>
        </div>
      )
    }

    if (phase === 'demographics') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            {t('hmOnboard.demographicsIntro')}
          </p>
          <div className="space-y-1">
            <p className="text-sm text-ink-600">{t('hmOnboard.raceLabel')}</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'Malay',   label: t('hmOnboard.raceMalay') },
                { value: 'Chinese', label: t('hmOnboard.raceChinese') },
                { value: 'Indian',  label: t('hmOnboard.raceIndian') },
                { value: 'Others',  label: t('hmOnboard.raceOthers') },
              ] as const).map((r) => (
                <button
                  key={r.value} type="button" onClick={() => setRace(r.value.toLowerCase())}
                  className={`border rounded-lg px-3 py-2 text-sm ${race === r.value.toLowerCase() ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
                >{r.label}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-ink-600">{t('hmOnboard.religionLabel')}</p>
            <select
              value={religion} onChange={(e) => setReligion(e.target.value)}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">{t('hmOnboard.religionSelect')}</option>
              <option value="islam">{t('hmOnboard.religionIslam')}</option>
              <option value="christianity">{t('hmOnboard.religionChristianity')}</option>
              <option value="buddhism">{t('hmOnboard.religionBuddhism')}</option>
              <option value="hinduism">{t('hmOnboard.religionHinduism')}</option>
              <option value="taoism">{t('hmOnboard.religionTaoism')}</option>
              <option value="chinese_folk">{t('hmOnboard.religionChineseFolk')}</option>
              <option value="no_religion">{t('hmOnboard.religionNone')}</option>
              <option value="others">{t('hmOnboard.religionOthers')}</option>
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-ink-600">{t('hmOnboard.languagesLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'english',          label: t('hmOnboard.langEnglish') },
                { value: 'bahasa_malaysia',  label: t('hmOnboard.langBahasaMalaysia') },
                { value: 'mandarin',         label: t('hmOnboard.langMandarin') },
                { value: 'cantonese',        label: t('hmOnboard.langCantonese') },
                { value: 'hokkien',          label: t('hmOnboard.langHokkien') },
                { value: 'hakka',            label: t('hmOnboard.langHakka') },
                { value: 'teochew',          label: t('hmOnboard.langTeochew') },
                { value: 'tamil',            label: t('hmOnboard.langTamil') },
                { value: 'others',           label: t('hmOnboard.langOthers') },
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
            <p className="text-sm text-ink-600">{t('hmOnboard.locationLabel')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setLocationMatters(true)}
                className={`border rounded-lg px-3 py-2 text-sm ${locationMatters === true ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >{t('hmOnboard.locationYes')}</button>
              <button
                type="button" onClick={() => { setLocationMatters(false); setLocationPostcode('') }}
                className={`border rounded-lg px-3 py-2 text-sm ${locationMatters === false ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >{t('hmOnboard.locationNo')}</button>
            </div>
            {locationMatters === true && (
              <input
                type="text" inputMode="numeric" pattern="[0-9]{5}" maxLength={5}
                value={locationPostcode} onChange={(e) => setLocationPostcode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder={t('hmOnboard.postcodePlaceholder')}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>
          <Button
            onClick={() => setPhase('hiringDetails')}
            disabled={!race || !religion || languages.length === 0 || locationMatters === null || (locationMatters === true && locationPostcode.length !== 5)}
            className="w-full" size="lg"
          >{t('common.continue')}</Button>
        </div>
      )
    }

    if (phase === 'hiringDetails') {
      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            {t('hmOnboard.hiringDetailsIntro')}
          </p>

          {/* Budget */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink-700">{t('hmOnboard.budgetLabel')}</p>
            <div className="grid grid-cols-3 gap-2">
              {(['yes', 'pending', 'unknown'] as const).map((v) => (
                <button
                  key={v} type="button" onClick={() => setBudgetApproved(v)}
                  className={`border rounded-lg px-3 py-2 text-sm capitalize ${budgetApproved === v ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
                >{v === 'yes' ? t('hmOnboard.budgetYes') : v === 'pending' ? t('hmOnboard.budgetPending') : t('hmOnboard.budgetUnknown')}</button>
              ))}
            </div>
            {budgetApproved === 'pending' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
                {t('hmOnboard.budgetPendingNote')}
              </p>
            )}
          </div>

          {/* Deadline */}
          <div className="space-y-1">
            <label htmlFor="hm-onboard-deadline" className="block text-sm font-medium text-ink-700">{t('hmOnboard.deadlineLabel')}</label>
            <input
              id="hm-onboard-deadline"
              type="date" value={deadlineToFill} onChange={(e) => setDeadlineToFill(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Interview rounds */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink-700">{t('hmOnboard.interviewRoundsLabel')}</p>
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
            <p className="text-sm font-medium text-ink-700">{t('hmOnboard.salaryFlexLabel')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setSalaryFlex(true)}
                className={`border rounded-lg px-3 py-2 text-sm ${salaryFlex === true ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >{t('hmOnboard.salaryFlexYes')}</button>
              <button
                type="button" onClick={() => setSalaryFlex(false)}
                className={`border rounded-lg px-3 py-2 text-sm ${salaryFlex === false ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >{t('hmOnboard.salaryFlexNo')}</button>
            </div>
          </div>

          {/* Failure at 90 days */}
          <div className="space-y-1">
            <label htmlFor="hm-onboard-failure-90d" className="block text-sm font-medium text-ink-700">
              {t('hmOnboard.failure90Label')} <span className="text-ink-400 font-normal">{t('hmOnboard.optionalParen')}</span>
            </label>
            <p className="text-xs text-ink-400">{t('hmOnboard.failure90Hint')}</p>
            <textarea
              id="hm-onboard-failure-90d"
              value={failureAt90Days} onChange={(e) => setFailureAt90Days(e.target.value)}
              rows={3} placeholder={t('hmOnboard.failure90Placeholder')}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <Button onClick={() => setPhase('dob')} className="w-full" size="lg">{t('common.continue')}</Button>
        </div>
      )
    }

    if (phase === 'dob') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            {t('hmOnboard.dobIntro')}
          </p>
          <input
            type="date" value={dob} onChange={(e) => { setDob(e.target.value); setDobSkipped(false) }}
            max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10) })()}
            className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="space-y-1">
            <p className="text-sm text-ink-600">{t('hmOnboard.genderLabel')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => { setGender('male'); setDobSkipped(false) }}
                className={`border rounded-lg px-3 py-2 text-sm ${gender === 'male' ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >{t('hmOnboard.genderMale')}</button>
              <button
                type="button" onClick={() => { setGender('female'); setDobSkipped(false) }}
                className={`border rounded-lg px-3 py-2 text-sm ${gender === 'female' ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >{t('hmOnboard.genderFemale')}</button>
            </div>
          </div>
          <Consent
            checked={dobConsent} onChange={setDobConsent}
            label={t('hmOnboard.dobConsentLabel')}
            required
          />
          {err && <Alert tone="red">{err}</Alert>}
          <Button
            onClick={() => { setDobSkipped(false); setPhase('review') }}
            disabled={!dob || !gender || !dobConsent}
            className="w-full" size="lg"
          >{t('hmOnboard.reviewAndConfirm')}</Button>

          <div className="pt-3 border-t border-ink-100">
            {!dobSkipPrompt ? (
              <button
                type="button" onClick={() => setDobSkipPrompt(true)}
                className="text-xs text-ink-400 hover:text-ink-600 underline"
              >{t('hmOnboard.preferNotToShare')}</button>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-sm text-amber-900">
                  {t('hmOnboard.dobSkipExplain')}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="secondary"
                    onClick={() => {
                      setDob(''); setGender(''); setDobConsent(false)
                      setDobSkipped(true); setDobSkipPrompt(false); setPhase('review')
                    }}
                  >{t('hmOnboard.skipAndContinue')}</Button>
                  <Button size="sm" onClick={() => setDobSkipPrompt(false)}>{t('hmOnboard.addItNow')}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }

    if (phase === 'review') {
      const activeConstraints = [
        hmRequiresDrivingLicense && t('hmOnboard.reviewConstraintDrivingLicense'),
        hmRequiresWeekends       && t('hmOnboard.reviewConstraintWeekends'),
        hmRequiresTravel         && t('hmOnboard.reviewConstraintTravel'),
        hmRequiresNightShifts    && t('hmOnboard.reviewConstraintNightShifts'),
        hmRequiresRelocation     && t('hmOnboard.reviewConstraintRelocation'),
        hmOnsiteOnly             && t('hmOnboard.reviewConstraintOnsiteOnly'),
        hmRequiresOwnTransport   && t('hmOnboard.reviewConstraintOwnTransport'),
        hmHasCommission          && t('hmOnboard.reviewConstraintCommission'),
      ].filter(Boolean) as string[]

      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            {t('hmOnboard.reviewIntro')}
          </p>

          <HMReviewRow label={t('hmOnboard.reviewChat')} value={t('hmOnboard.reviewCompleted')} ok />
          <HMReviewRow
            label={t('hmOnboard.reviewDob')}
            value={dob ? t('hmOnboard.reviewDobValue', { dob }) : dobSkipped ? t('hmOnboard.reviewDobSkipped') : '—'}
            ok={!!dob}
          />
          <HMReviewRow label={t('hmOnboard.reviewGender')} value={gender || (dobSkipped ? t('hmOnboard.reviewSkipped') : '—')} ok={!!gender} />
          <HMReviewRow label={t('hmOnboard.reviewRace')} value={race || '—'} ok={!!race} />
          <HMReviewRow label={t('hmOnboard.reviewReligion')} value={religion || '—'} ok={!!religion} />
          <HMReviewRow label={t('hmOnboard.reviewLanguages')} value={languages.length > 0 ? languages.join(', ') : '—'} ok={languages.length > 0} />
          <HMReviewRow label={t('hmOnboard.reviewOfficeLocation')} value={locationMatters === true ? t('hmOnboard.reviewPostcode', { postcode: locationPostcode }) : locationMatters === false ? t('hmOnboard.reviewOpenLocation') : '—'} ok={locationMatters !== null} />
          <HMReviewRow label={t('hmOnboard.reviewRoleConstraints')} value={activeConstraints.length > 0 ? activeConstraints.join(' · ') : t('hmOnboard.reviewNoneSet')} ok />
          {mustHaveItems.length > 0 && <HMReviewRow label={t('hmOnboard.reviewAdditionalReq')} value={mustHaveItems.join(' · ')} ok />}
          <HMReviewRow label={t('hmOnboard.reviewBudgetApproved')} value={budgetApproved || t('hmOnboard.reviewNotSpecified')} ok={!!budgetApproved} />
          {deadlineToFill && <HMReviewRow label={t('hmOnboard.reviewDeadline')} value={deadlineToFill} ok />}
          {interviewRoundsHM != null && <HMReviewRow label={t('hmOnboard.reviewInterviewRounds')} value={String(interviewRoundsHM)} ok />}
          {salaryFlex != null && <HMReviewRow label={t('hmOnboard.reviewSalaryFlex')} value={salaryFlex ? t('hmOnboard.reviewNegotiable') : t('hmOnboard.reviewFixedBand')} ok />}
          {failureAt90Days && <HMReviewRow label={t('hmOnboard.reviewFailure90')} value={failureAt90Days} ok />}

          {err && <Alert tone="red">{err}</Alert>}
          <Button onClick={() => { setPhase('submit'); void finalise() }} loading={busy} className="w-full" size="lg">
            {t('hmOnboard.buildProfile')}
          </Button>
          <button
            type="button" onClick={() => { setErr(null); setPhase('dob') }}
            className="w-full text-xs text-ink-400 hover:text-ink-600 py-1"
          >{t('hmOnboard.goBackChange')}</button>
        </div>
      )
    }

    if (phase === 'submit') {
      return (
        <div className="space-y-2 text-center">
          {err ? (
            <>
              <Alert tone="red">{err}</Alert>
              <Button onClick={() => void finalise()} loading={busy} className="w-full">
                {t('hmOnboard.retry')}
              </Button>
              <button
                type="button"
                onClick={() => { setErr(null); setPhase('review') }}
                className="w-full text-xs text-ink-400 hover:text-ink-600 py-1"
              >{t('hmOnboard.backToReview')}</button>
            </>
          ) : (
            <p className="text-sm text-ink-500 py-3 animate-pulse">{t('hmOnboard.buildingProfile')}</p>
          )}
        </div>
      )
    }

    return <div />
  })()

  if (phase === 'done') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <h1 className="text-2xl font-bold mb-2">{t('hmOnboard.doneTitle')}</h1>
        <p className="text-ink-600">{t('hmOnboard.doneSubtitle')}</p>
      </div>
    )
  }

  const headline =
    phase === 'basics'       ? t('hmOnboard.headlineBasics') :
    phase === 'chat'         ? t('hmOnboard.headlineChat') :
    phase === 'mustHaves'    ? t('hmOnboard.headlineMustHaves') :
    phase === 'demographics' ? t('hmOnboard.headlineDemographics') :
    phase === 'hiringDetails'? t('hmOnboard.headlineHiringDetails') :
    phase === 'dob'          ? t('hmOnboard.headlineDob') :
    phase === 'review'       ? t('hmOnboard.headlineReview') :
    phase === 'submit'       ? t('hmOnboard.headlineSubmit') : ''

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
