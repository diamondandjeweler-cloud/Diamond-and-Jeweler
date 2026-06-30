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
import { profileEmailById, updateProfile } from '../../data/repositories/profiles'
import { encryptDob, markOnboardingComplete } from '../../lib/api'
import { callFunction } from '../../lib/functions'
import { getLifeChartCharacter, type Gender } from '../../shared/domain/lifeChart/lifeChartCharacter'
import ChatShell, { ChatMessage } from '../../components/ChatShell'
import { Button, Alert } from '../../components/ui'
import { type Phase, type ApiMessage, headlineForPhase, progressPctForPhase } from './hm/helpers'
import BasicsStep from './hm/BasicsStep'
import MustHavesStep from './hm/MustHavesStep'
import DemographicsStep from './hm/DemographicsStep'
import HiringDetailsStep from './hm/HiringDetailsStep'
import DobStep from './hm/DobStep'
import ReviewStep from './hm/ReviewStep'

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
        const { data: prof } = await profileEmailById(userId).maybeSingle()
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
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
          updateProfile(session!.user.id, { interview_transcript: { messages: finalMsgs, saved_at: savedAt } }),
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
          updateProfile(session!.user.id, { interview_transcript: { messages: partialMsgs, saved_at: savedAt, partial: true } }),
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
        const { error: consentErr } = await updateProfile(userId, { consents: nextConsents })
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

      const { error: profErr } = await updateProfile(userId, { full_name: fullName.trim() })
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
        <BasicsStep
          t={t}
          fullName={fullName} setFullName={setFullName}
          jobTitle={jobTitle} setJobTitle={setJobTitle}
          switching={switching} switchErr={switchErr}
          onSubmit={() => setPhase('chat')}
          onSwitchToTalent={() => void handleSwitchToTalent()}
        />
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
            className="flex-1 resize-none rounded-xl border border-ink-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50 dark:disabled:bg-gray-900"
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
      return (
        <MustHavesStep
          t={t}
          hmRequiresDrivingLicense={hmRequiresDrivingLicense} setHmRequiresDrivingLicense={setHmRequiresDrivingLicense}
          hmRequiresWeekends={hmRequiresWeekends} setHmRequiresWeekends={setHmRequiresWeekends}
          hmRequiresTravel={hmRequiresTravel} setHmRequiresTravel={setHmRequiresTravel}
          hmRequiresNightShifts={hmRequiresNightShifts} setHmRequiresNightShifts={setHmRequiresNightShifts}
          hmRequiresRelocation={hmRequiresRelocation} setHmRequiresRelocation={setHmRequiresRelocation}
          hmOnsiteOnly={hmOnsiteOnly} setHmOnsiteOnly={setHmOnsiteOnly}
          hmRequiresOwnTransport={hmRequiresOwnTransport} setHmRequiresOwnTransport={setHmRequiresOwnTransport}
          hmHasCommission={hmHasCommission} setHmHasCommission={setHmHasCommission}
          mustHaveItems={mustHaveItems} setMustHaveItems={setMustHaveItems}
          mustHaveInput={mustHaveInput} setMustHaveInput={setMustHaveInput}
          onContinue={() => setPhase('demographics')}
        />
      )
    }

    if (phase === 'demographics') {
      return (
        <DemographicsStep
          t={t}
          race={race} setRace={setRace}
          religion={religion} setReligion={setReligion}
          languages={languages} setLanguages={setLanguages}
          locationMatters={locationMatters} setLocationMatters={setLocationMatters}
          locationPostcode={locationPostcode} setLocationPostcode={setLocationPostcode}
          onContinue={() => setPhase('hiringDetails')}
        />
      )
    }

    if (phase === 'hiringDetails') {
      return (
        <HiringDetailsStep
          t={t}
          budgetApproved={budgetApproved} setBudgetApproved={setBudgetApproved}
          deadlineToFill={deadlineToFill} setDeadlineToFill={setDeadlineToFill}
          interviewRoundsHM={interviewRoundsHM} setInterviewRoundsHM={setInterviewRoundsHM}
          salaryFlex={salaryFlex} setSalaryFlex={setSalaryFlex}
          failureAt90Days={failureAt90Days} setFailureAt90Days={setFailureAt90Days}
          onContinue={() => setPhase('dob')}
        />
      )
    }

    if (phase === 'dob') {
      return (
        <DobStep
          t={t}
          dob={dob} setDob={setDob}
          gender={gender} setGender={setGender}
          dobConsent={dobConsent} setDobConsent={setDobConsent}
          dobSkipPrompt={dobSkipPrompt} setDobSkipPrompt={setDobSkipPrompt}
          setDobSkipped={setDobSkipped}
          err={err}
          onAdvanceToReview={() => setPhase('review')}
        />
      )
    }

    if (phase === 'review') {
      return (
        <ReviewStep
          t={t}
          dob={dob} gender={gender} dobSkipped={dobSkipped}
          race={race} religion={religion} languages={languages}
          locationMatters={locationMatters} locationPostcode={locationPostcode}
          hmRequiresDrivingLicense={hmRequiresDrivingLicense} hmRequiresWeekends={hmRequiresWeekends}
          hmRequiresTravel={hmRequiresTravel} hmRequiresNightShifts={hmRequiresNightShifts}
          hmRequiresRelocation={hmRequiresRelocation} hmOnsiteOnly={hmOnsiteOnly}
          hmRequiresOwnTransport={hmRequiresOwnTransport} hmHasCommission={hmHasCommission}
          mustHaveItems={mustHaveItems}
          budgetApproved={budgetApproved} deadlineToFill={deadlineToFill}
          interviewRoundsHM={interviewRoundsHM} salaryFlex={salaryFlex} failureAt90Days={failureAt90Days}
          err={err} busy={busy}
          onBuild={() => { setPhase('submit'); void finalise() }}
          onBack={() => { setErr(null); setPhase('dob') }}
        />
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
                className="w-full text-xs text-ink-400 dark:text-gray-400 hover:text-ink-600 dark:hover:text-gray-300 py-1"
              >{t('hmOnboard.backToReview')}</button>
            </>
          ) : (
            <p className="text-sm text-ink-500 dark:text-gray-400 py-3 animate-pulse">{t('hmOnboard.buildingProfile')}</p>
          )}
        </div>
      )
    }

    return <div />
  })()

  if (phase === 'done') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <h1 className="text-2xl font-bold mb-2 dark:text-white">{t('hmOnboard.doneTitle')}</h1>
        <p className="text-ink-600 dark:text-gray-300">{t('hmOnboard.doneSubtitle')}</p>
      </div>
    )
  }

  const headline = headlineForPhase(phase, t)

  const progressPct = progressPctForPhase(phase)

  return (
    <>
      {DiamondPointsInfo}
      <ChatShell messages={log} input={composer} headline={headline} progressPct={progressPct} formMode={phase !== 'chat'} />
    </>
  )
}
