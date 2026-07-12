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
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '../../lib/supabase'
import { insertRole, getOnboardingDraftRoleId } from '../../data/repositories/roles'
import { companyIdByCreator, companyIdByHrEmail } from '../../data/repositories/companies'
import { profileEmailById, updateProfile } from '../../data/repositories/profiles'
import { hmIdByProfileId, upsertHmCompanyLink, updateHmInterviewTranscript, updateHmById } from '../../data/repositories/hiringManagers'
import type { Json } from '../../types/db.generated'
import { encryptDob, markOnboardingComplete } from '../../lib/api'
import { callFunction } from '../../lib/functions'
import { type Gender } from '../../shared/domain/lifeChart/lifeChartCharacter'
import ChatShell, { ChatMessage } from '../../components/ChatShell'
import { Button, Alert } from '../../components/ui'
import { type Phase, type ApiMessage, headlineForPhase, progressPctForPhase, hmRestorePhase } from './hm/helpers'
import { buildHmUpdate, type ExtractedHmProfile, type HmOnboardingData } from './hm/submitHmOnboarding'
import { useOnboardingChat } from './useOnboardingChat'
import BasicsStep from './hm/BasicsStep'
import MustHavesStep from './hm/MustHavesStep'
import DemographicsStep from './hm/DemographicsStep'
import HiringDetailsStep from './hm/HiringDetailsStep'
import DobStep from './hm/DobStep'
import ReviewStep from './hm/ReviewStep'

export default function HMOnboarding() {
  const { t } = useTranslation()
  const { session, profile, refresh } = useSession(useShallow((s) => ({ session: s.session, profile: s.profile, refresh: s.refresh })))
  const navigate = useNavigate()

  const BO_GREETING = t('hmOnboard.boGreeting')

  const [phase, setPhase] = useState<Phase>('basics')
  const [switching, setSwitching] = useState(false)
  const [switchErr, setSwitchErr] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [log, setLog] = useState<ChatMessage[]>([])
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([])
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Clear any pending phase timer when the component unmounts. (The shared
  // useOnboardingChat hook separately aborts any in-flight SSE stream.)
  useEffect(() => () => {
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
      const { data: hmRow } = await hmIdByProfileId(userId)

      if (hmRow) return // all good

      // No HM row — try to find a company this user owns
      const { data: company } = await companyIdByCreator(userId)

      if (!company) {
        // Also try primary_hr_email match
        const { data: prof } = await profileEmailById(userId).maybeSingle()
        if (prof?.email) {
          const { data: companyByEmail } = await companyIdByHrEmail(prof.email)
          if (companyByEmail) {
            await upsertHmCompanyLink(userId, companyByEmail.id)
            return // healed
          }
        }
        if (mounted) setHmMissing(true) // no company at all — show error
        return
      }

      // Found a company — insert the missing HM row silently
      await upsertHmCompanyLink(userId, company.id)
      // healed — no error shown, onboarding proceeds
    }

    void preflight()
    return () => { mounted = false }
  }, [session?.user.id])

  const idRef = useRef(0)
  const nextId = () => `m${++idRef.current}`
  const conversationIdRef = useRef<string>(crypto.randomUUID())
  const chatInitRef = useRef(false)
  const updatedRef = useRef(false)
  const inFlightRef = useRef(false)
  const draftCheckRef = useRef(false)
  const draftKey = session ? `dnj.hm-onboard.${session.user.id}` : null

  // ── Shared Bo chat-streaming engine ───────────────────────────────────────────
  const { input, setInput, isStreaming, sendMessage, stop } = useOnboardingChat({
    phase,
    log,
    setLog,
    apiMessages,
    setApiMessages,
    nextId,
    conversationIdRef,
    config: {
      slowWarning: t('hmOnboard.chatSlowWarning'),
      chatError: t('hmOnboard.chatError'),
      progressSaved: t('hmOnboard.chatProgressSaved'),
      buildRequestBody: () => ({ mode: 'hm' }),
      onDraftComplete: () => {
        if (!draftKey) return
        try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      },
      onDraftPartial: (msgs) => {
        if (!draftKey) return
        try {
          localStorage.setItem(draftKey, JSON.stringify({ fullName, jobTitle, apiMessages: msgs }))
        } catch { /* ignore */ }
      },
      persistTranscript: (msgs, { partial }) => {
        const savedAt = new Date().toISOString()
        Promise.all([
          updateProfile(session!.user.id, {
            // ApiMessage[] is valid JSON; interface lacks an index signature so TS
            // needs a boundary cast (no runtime change).
            interview_transcript: { messages: msgs, saved_at: savedAt, ...(partial ? { partial: true } : {}) } as unknown as Json,
          }),
          updateHmInterviewTranscript(session!.user.id, msgs),
        ]).then(() => { /* best-effort */ })
      },
      onProfileReady: () => {
        setLog((l) => [...l, {
          id: nextId(), from: 'system',
          content: t('hmOnboard.chatAlmostDone'),
        }])
        phaseTimerRef.current = setTimeout(() => setPhase('mustHaves'), 600)
      },
    },
  })

  useEffect(() => {
    if (!isStreaming && phase === 'chat') {
      chatInputRef.current?.focus()
    }
  }, [isStreaming, phase])

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
      // hmRestorePhase routes a saved 'review' phase back to 'dob': DOB/gender/
      // dobConsent/dobSkipped are never persisted, so restoring straight to
      // 'review' would land on an empty-DOB summary that can still be submitted,
      // silently dropping them (date_of_birth_encrypted/gender/life_chart_character
      // null). See helpers.ts.
      if (d.apiMessages && d.apiMessages.length > 1) {
        setApiMessages(d.apiMessages)
        setLog(d.apiMessages.map((m, i) => ({
          id: `r${i}`,
          from: (m.role === 'assistant' ? 'system' : 'you') as 'system' | 'you',
          content: m.content.replace('[PROFILE_READY]', '').trim(),
        })))
        chatInitRef.current = true
        setPhase(d.phase && d.phase !== 'basics' && d.phase !== 'done' && d.phase !== 'submit' ? hmRestorePhase(d.phase) : 'chat')
      } else if (d.phase && d.phase !== 'basics' && d.phase !== 'done' && d.phase !== 'submit') {
        setPhase(hmRestorePhase(d.phase))
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
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
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
      const extracted = await extRes.json() as ExtractedHmProfile
      if (extracted.error) throw new Error(`Profile extraction failed: ${extracted.error}`)

      const { data: hmRow, error: hmErr } = await hmIdByProfileId(userId)
      if (hmErr) throw hmErr
      if (!hmRow) throw new Error(t('hmOnboard.noHmRecord'))

      // Row construction lives in the pure buildHmUpdate builder so the exact
      // payload is golden-tested in isolation. It applies the same form-value-
      // over-extracted precedence and the interview_answers Json boundary cast.
      const hmFormData: HmOnboardingData = {
        dob, dobEncrypted, gender, jobTitle, failureAt90Days, salaryFlex, interviewRoundsHM,
        mustHaveItems, race, religion, languages, locationMatters, locationPostcode,
        budgetApproved, deadlineToFill,
        hmRequiresDrivingLicense, hmRequiresWeekends, hmRequiresTravel, hmRequiresNightShifts,
        hmRequiresRelocation, hmOnsiteOnly, hmRequiresOwnTransport, hmHasCommission,
        apiMessages,
      }
      const { error: updateErr } = await updateHmById(hmRow.id, buildHmUpdate(extracted, hmFormData))
      if (updateErr) throw updateErr

      const { error: profErr } = await updateProfile(userId, { full_name: fullName.trim() })
      if (profErr) throw profErr

      // Auto-create a draft role from chat data so the HM doesn't re-enter everything.
      // Only insert if no paused onboarding draft already exists (idempotent on retry).
      if (extracted.role_type) {
        const { data: existingDraft } = await getOnboardingDraftRoleId(hmRow.id)
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
            className="flex-1 resize-none rounded-xl border border-border dark:bg-surface dark:text-fg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-canvas"
            // Active chat surface — autoFocus when entering this step is intentional.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {isStreaming ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => stop()}>{t('hmOnboard.stop')}</Button>
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
                className="w-full text-xs text-ink-400 dark:text-fg-muted hover:text-ink-600 dark:hover:text-fg-strong py-1"
              >{t('hmOnboard.backToReview')}</button>
            </>
          ) : (
            <p className="text-sm text-fg-muted py-3 animate-pulse">{t('hmOnboard.buildingProfile')}</p>
          )}
        </div>
      )
    }

    return <div />
  })()

  if (phase === 'done') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <h1 className="text-2xl font-bold mb-2 dark:text-fg">{t('hmOnboard.doneTitle')}</h1>
        <p className="text-fg-muted">{t('hmOnboard.doneSubtitle')}</p>
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
