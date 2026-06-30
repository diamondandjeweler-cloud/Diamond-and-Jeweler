/**
 * TalentOnboarding — AI-powered chat onboarding.
 *
 * Phases:
 *   basics — structured form: name + phone (never sent to AI)
 *   chat   — Bo (Claude) career conversation, ends with [PROFILE_READY]
 *   dob    — structured date input (encrypted, used internally for matching)
 *   docs   — IC + résumé upload
 *   submit — extract profile from transcript, upload files, insert talents row
 *   done   — redirect to /talent
 *
 * PDPA: name/phone collected locally via form, stored directly to Supabase.
 * They are never forwarded to the chat-onboard Edge Function or any external AI.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { uploadPrivate } from '../../lib/storage'
import { encryptDob, markOnboardingComplete } from '../../lib/api'
import { callFunction } from '../../lib/functions'
import { getLifeChartCharacter, type Gender } from '../../lib/lifeChartCharacter'
import ChatShell, { ChatMessage } from '../../components/ChatShell'
import { Button, Alert } from '../../components/ui'
import DobConfirmModal from '../../components/DobConfirmModal'
import {
  type LanguageReq, type NNAtom,
} from '../../components/role-form'
import { type Phase, type ApiMessage, computeUsesLunarCalendar } from './talent/helpers'
import { ProgressStep, FileRow } from './talent/StepBits'
import DobStep from './talent/DobStep'
import DealBreakersStep from './talent/DealBreakersStep'
import ExtrasStep from './talent/ExtrasStep'
import ReviewStep from './talent/ReviewStep'

export default function TalentOnboarding() {
  const { t } = useTranslation()
  const { session, refresh } = useSession()
  const navigate = useNavigate()

  const BO_GREETING = t('talentOnboard.boGreeting')

  const [phase, setPhase] = useState<Phase>('basics')
  const [switching, setSwitching] = useState(false)
  const [switchErr, setSwitchErr] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
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
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [locationMatters, setLocationMatters] = useState<boolean | null>(null)
  const [locationPostcode, setLocationPostcode] = useState('')
  const [openToNewField, setOpenToNewField] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [dobConfirmOpen, setDobConfirmOpen] = useState(false)
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null)
  const [race, setRace] = useState('')
  const [religion, setReligion] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [dealBreakerItems, setDealBreakerItems] = useState<string[]>([])
  const [dealBreakerInput, setDealBreakerInput] = useState('')
  const [minSalaryHard, setMinSalaryHard] = useState<number | null>(null)
  const [noWeekendWork, setNoWeekendWork] = useState(false)
  const [noDrivingLicense, setNoDrivingLicense] = useState(false)
  const [noTravel, setNoTravel] = useState(false)
  const [noNightShifts, setNoNightShifts] = useState(false)
  const [noOwnCar, setNoOwnCar] = useState(false)
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [noRelocation, setNoRelocation] = useState(false)
  const [noOvertime, setNoOvertime] = useState(false)
  const [noCommissionOnly, setNoCommissionOnly] = useState(false)
  const [dobConsent, setDobConsent] = useState(false)
  // 0112: structured matching extras
  const [skills, setSkills] = useState<string[]>([])
  const [languagesProficiency, setLanguagesProficiency] = useState<LanguageReq[]>([])
  const [availableShifts, setAvailableShifts] = useState<string[]>([])
  const [availableDaysPerWeek, setAvailableDaysPerWeek] = useState<number | ''>('')
  const [environmentPreferences, setEnvironmentPreferences] = useState<string[]>([])
  const [candidateTypes, setCandidateTypes] = useState<string[]>([])
  const [priorityConcernsText, setPriorityConcernsText] = useState('')
  const [priorityConcernsAtoms, setPriorityConcernsAtoms] = useState<NNAtom[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dobAttempted, setDobAttempted] = useState(false)

  // Refocus chat input after each streaming response completes
  useEffect(() => {
    if (!isStreaming && phase === 'chat') {
      chatInputRef.current?.focus()
    }
  }, [isStreaming, phase])

  const idRef = useRef(0)
  const nextId = () => `m${++idRef.current}`
  // Stable conversation id for the whole onboarding chat — every turn shares it
  // so analytics can group the full transcript.
  const conversationIdRef = useRef<string>(crypto.randomUUID())
  const chatInitRef = useRef(false)
  const talentIdRef = useRef<string | null>(null)
  const draftCheckRef = useRef(false)
  const sessionId = session?.user.id

  // ── Draft key ────────────────────────────────────────────────────────────────
  const draftKey = sessionId ? `dnj.onboard.${sessionId}` : null

  // ── On mount: restore saved progress ────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || draftCheckRef.current) return
    draftCheckRef.current = true

    async function checkSavedProgress() {
      const { data: prof } = await supabase
        .from('profiles')
        .select('interview_transcript, full_name, phone')
        .eq('id', sessionId!)
        .maybeSingle()

      const savedTranscript = (prof?.interview_transcript as { messages: ApiMessage[]; saved_at: string } | null)
      const raw = draftKey ? localStorage.getItem(draftKey) : null
      const draft = raw ? (JSON.parse(raw) as {
        phase?: Phase; fullName?: string; phone?: string; gender?: string
        race?: string; religion?: string; languages?: string[]
        locationMatters?: boolean | null; locationPostcode?: string; openToNewField?: boolean
        apiMessages?: ApiMessage[]
        dealBreakerItems?: string[]; minSalaryHard?: number | null
        noWeekendWork?: boolean; noDrivingLicense?: boolean; noTravel?: boolean
        noNightShifts?: boolean; noOwnCar?: boolean; remoteOnly?: boolean
        noRelocation?: boolean; noOvertime?: boolean; noCommissionOnly?: boolean
        skills?: string[]; languagesProficiency?: LanguageReq[]
        availableShifts?: string[]; availableDaysPerWeek?: number | ''
        environmentPreferences?: string[]; candidateTypes?: string[]
        priorityConcernsText?: string; priorityConcernsAtoms?: NNAtom[]
      }) : null

      const restoredName = draft?.fullName || (prof?.full_name as string | null) || ''
      const restoredPhone = draft?.phone || (prof?.phone as string | null) || ''

      // Shared helper: restore all structured form fields from draft
      function restoreDraftFields(d: typeof draft) {
        if (!d) return
        if (d.gender) setGender(d.gender as Gender)
        if (d.race) setRace(d.race)
        if (d.religion) setReligion(d.religion)
        if (d.languages?.length) setLanguages(d.languages)
        if (d.locationMatters != null) setLocationMatters(d.locationMatters)
        if (d.locationPostcode) setLocationPostcode(d.locationPostcode)
        if (d.openToNewField != null) setOpenToNewField(d.openToNewField)
        if (d.dealBreakerItems?.length) setDealBreakerItems(d.dealBreakerItems)
        if (d.minSalaryHard != null) setMinSalaryHard(d.minSalaryHard)
        if (d.noWeekendWork) setNoWeekendWork(d.noWeekendWork)
        if (d.noDrivingLicense) setNoDrivingLicense(d.noDrivingLicense)
        if (d.noTravel) setNoTravel(d.noTravel)
        if (d.noNightShifts) setNoNightShifts(d.noNightShifts)
        if (d.noOwnCar) setNoOwnCar(d.noOwnCar)
        if (d.remoteOnly) setRemoteOnly(d.remoteOnly)
        if (d.noRelocation) setNoRelocation(d.noRelocation)
        if (d.noOvertime) setNoOvertime(d.noOvertime)
        if (d.noCommissionOnly) setNoCommissionOnly(d.noCommissionOnly)
        if (d.skills?.length) setSkills(d.skills)
        if (d.languagesProficiency?.length) setLanguagesProficiency(d.languagesProficiency)
        if (d.availableShifts?.length) setAvailableShifts(d.availableShifts)
        if (d.availableDaysPerWeek != null) setAvailableDaysPerWeek(d.availableDaysPerWeek)
        if (d.environmentPreferences?.length) setEnvironmentPreferences(d.environmentPreferences)
        if (d.candidateTypes?.length) setCandidateTypes(d.candidateTypes)
        if (d.priorityConcernsText) setPriorityConcernsText(d.priorityConcernsText)
        if (d.priorityConcernsAtoms?.length) setPriorityConcernsAtoms(d.priorityConcernsAtoms)
      }

      if (savedTranscript?.messages?.length) {
        // Chat is complete — restore it so the user never has to redo the conversation.
        setApiMessages(savedTranscript.messages)
        setLog(savedTranscript.messages.map((m, i) => ({
          id: `r${i}`,
          from: (m.role === 'assistant' ? 'system' : 'you') as 'system' | 'you',
          content: m.content.replace('[PROFILE_READY]', '').trim(),
        })))
        setFullName(restoredName)
        setPhone(restoredPhone)
        restoreDraftFields(draft)
        setPhase('resume')
      } else if (draft?.apiMessages && draft.apiMessages.length > 1) {
        // Mid-chat restore — resume exactly where they left off.
        setApiMessages(draft.apiMessages)
        setLog(draft.apiMessages.map((m, i) => ({
          id: `r${i}`,
          from: (m.role === 'assistant' ? 'system' : 'you') as 'system' | 'you',
          content: m.content.replace('[PROFILE_READY]', '').trim(),
        })))
        chatInitRef.current = true
        if (restoredName) setFullName(restoredName)
        if (restoredPhone) setPhone(restoredPhone)
        restoreDraftFields(draft)
        setPhase('chat')
      } else if (draft?.fullName && draft.phase && draft.phase !== 'basics') {
        // Partial progress in a later phase.
        setFullName(draft.fullName)
        if (draft.phone) setPhone(draft.phone)
        restoreDraftFields(draft)
        setPhase('resume')
      } else if (restoredName) {
        // Pre-fill name/phone from profile but stay on basics.
        setFullName(restoredName)
        setPhone(restoredPhone)
      }
    }

    void checkSavedProgress()
  }, [sessionId, draftKey])

  // ── Autosave draft whenever key fields change ─────────────────────────────
  // DOB intentionally excluded — never persisted to localStorage in plaintext.
  // apiMessages included so a crash between [PROFILE_READY] and finalise() can
  // be recovered without re-running the whole chat.
  useEffect(() => {
    if (!draftKey || phase === 'basics' || phase === 'resume' || phase === 'done' || phase === 'submit') return
    try {
      const prev = JSON.parse(localStorage.getItem(draftKey) || '{}') as Record<string, unknown>
      localStorage.setItem(draftKey, JSON.stringify({
        ...prev,
        phase, fullName, phone, gender: gender || '',
        ...(apiMessages.length > 1 ? { apiMessages } : {}),
        race, religion, languages, locationMatters, locationPostcode, openToNewField,
        dealBreakerItems, minSalaryHard,
        noWeekendWork, noDrivingLicense, noTravel, noNightShifts,
        noOwnCar, remoteOnly, noRelocation, noOvertime, noCommissionOnly,
        skills, languagesProficiency, availableShifts, availableDaysPerWeek,
        environmentPreferences, candidateTypes,
        priorityConcernsText, priorityConcernsAtoms,
      }))
    } catch { /* ignore storage errors */ }
  }, [
    draftKey, phase, fullName, phone, gender, apiMessages,
    race, religion, languages, locationMatters, locationPostcode, openToNewField,
    dealBreakerItems, minSalaryHard,
    noWeekendWork, noDrivingLicense, noTravel, noNightShifts,
    noOwnCar, remoteOnly, noRelocation, noOvertime, noCommissionOnly,
    skills, languagesProficiency, availableShifts, availableDaysPerWeek,
    environmentPreferences, candidateTypes,
    priorityConcernsText, priorityConcernsAtoms,
  ])

  // Seed Bo's greeting when entering the chat phase — no API call needed.
  useEffect(() => {
    if (phase !== 'chat' || chatInitRef.current) return
    chatInitRef.current = true
    setLog([{ id: nextId(), from: 'system', content: BO_GREETING }])
    setApiMessages([{ role: 'assistant', content: BO_GREETING }])
  }, [phase])

  async function handleSwitchToHiring() {
    setSwitching(true)
    setSwitchErr(null)
    try {
      await callFunction('switch-account-type', { new_role: 'hiring_manager' })
      await refresh()
      navigate('/onboarding/hm')
    } catch (e) {
      setSwitchErr(e instanceof Error ? e.message : t('talentOnboard.switchFailed'))
      setSwitching(false)
    }
  }

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
          content: t('talentOnboard.aiSlowWarning'),
        }])
      }, 10_000)

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-onboard`,
        {
          method: 'POST',
          signal: abortCtrl.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ messages: newApiMsgs, dob: dob || undefined, gender: gender || undefined, conversation_id: conversationIdRef.current }),
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
              setLog((l) =>
                l.map((m) => (m.id === boId ? { ...m, content: display, typing: false } : m)),
              )
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
            // Chat done — wipe mid-chat snapshot; Supabase has the real record.
            const d = JSON.parse(localStorage.getItem(draftKey) || '{}') as Record<string, unknown>
            const { apiMessages: _a, ...rest } = d
            localStorage.setItem(draftKey, JSON.stringify(rest))
          } else {
            const d = JSON.parse(localStorage.getItem(draftKey) || '{}') as Record<string, unknown>
            localStorage.setItem(draftKey, JSON.stringify({ ...d, apiMessages: finalMsgs, phase: 'chat' }))
          }
        } catch { /* ignore storage errors */ }
      }

      if (accumulated.includes('[PROFILE_READY]')) {
        // Persist transcript to Supabase immediately — before DOB / docs phases.
        supabase.from('profiles')
          .update({ interview_transcript: { messages: finalMsgs, saved_at: new Date().toISOString() } })
          .eq('id', session!.user.id)
          .then(() => { /* best-effort draft save */ })

        setLog((l) => [
          ...l,
          {
            id: nextId(),
            from: 'system',
            content: t('talentOnboard.chatDoneMessage'),
          },
        ])
        phaseTimerRef.current = setTimeout(() => setPhase('dob'), 600)
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (isAbort && accumulated.trim()) {
        const partialMsgs: ApiMessage[] = [...newApiMsgs, { role: 'assistant', content: accumulated }]
        setApiMessages(partialMsgs)
        if (draftKey) {
          try {
            const d = JSON.parse(localStorage.getItem(draftKey) || '{}') as Record<string, unknown>
            localStorage.setItem(draftKey, JSON.stringify({ ...d, apiMessages: partialMsgs, phase: 'chat' }))
          } catch { /* ignore */ }
        }
        supabase.from('profiles')
          .update({ interview_transcript: { messages: partialMsgs, saved_at: new Date().toISOString(), partial: true } })
          .eq('id', session!.user.id)
          .then(() => {})
        setLog((l) => [
          ...l.map((m) => m.id === boId ? { ...m, typing: false } : m),
          { id: nextId(), from: 'system', content: t('talentOnboard.progressSaved') },
        ])
      } else if (isAbort) {
        setLog((l) => l.map((m) => m.id === boId ? { ...m, content: '', typing: false } : m))
      } else {
        setLog((l) =>
          l.map((m) =>
            m.id === boId
              ? { ...m, content: t('talentOnboard.chatError'), typing: false }
              : m,
          ),
        )
      }
    } finally {
      clearWarn()
      setIsStreaming(false)
    }
  }

  async function finalise() {
    if (!session) return
    setErr(null)
    setBusy(true)
    try {
      const userId = session.user.id
      let talentId = talentIdRef.current

      // Always re-upload files when they are present so that a retry after a
      // partial failure (where talentIdRef is already set) picks up any new
      // files the user may have chosen by going back to the docs phase.
      const [resumePath, clPath, photoPath, dobEncrypted] = await Promise.all([
        resumeFile ? uploadPrivate('resumes', resumeFile, userId, resumeFile.name) : Promise.resolve<string | null>(null),
        coverLetterFile
          ? uploadPrivate('resumes', coverLetterFile, userId, `cover-letter-${coverLetterFile.name}`)
          : Promise.resolve<string | null>(null),
        photoFile ? uploadPrivate('talent-photos', photoFile, userId, photoFile.name) : Promise.resolve<string | null>(null),
        encryptDob(dob),
      ])

      // Steps 2-3 and 5-6 run only on first attempt. On retry after a partial
      // failure, talentIdRef.current is already set so we skip straight to the
      // PII update and markOnboardingComplete (which are idempotent).
      if (!talentId) {

        const { data: authData } = await supabase.auth.getSession()
        const token = authData.session?.access_token
        if (!token) throw new Error('Not authenticated')

        // Best-effort: read resume as text for cross-referencing in the extract prompt.
        // Works for plain-text and some simple PDFs; silently skipped for binary formats.
        let resumeText: string | undefined
        try {
          const raw = await resumeFile!.text()
          if (raw.length > 50 && raw.charCodeAt(0) >= 32) {
            resumeText = raw.slice(0, 4000)
          }
        } catch { /* best effort */ }

        const lifeChartCharacter = gender
          ? getLifeChartCharacter(dob, gender)
          : null

        // 2. Upsert the talents row (not insert) so that a page-refresh retry
        //    after the ref is reset doesn't hit the profile_id UNIQUE constraint.
        //    The async worker fills extracted fields and flips is_open_to_offers.
        const { data: talentRow, error: insErr } = await supabase.from('talents').upsert({
          profile_id: userId,
          date_of_birth_encrypted: dobEncrypted,
          gender: gender || null,
          life_chart_character: lifeChartCharacter,
          location_matters: locationMatters === true,
          location_postcode: locationMatters && locationPostcode.trim() ? locationPostcode.trim() : null,
          open_to_new_field: openToNewField,
          interview_answers: { transcript: apiMessages },
          race: race || null,
          religion: religion || null,
          languages,
          uses_lunar_calendar: computeUsesLunarCalendar(race, religion, languages),
          is_open_to_offers: false,
          extraction_status: 'pending',
          photo_url: photoPath,
          deal_breakers: {
            items: dealBreakerItems,
            min_salary_hard: minSalaryHard,
            no_weekend_work: noWeekendWork,
            no_driving_license: noDrivingLicense,
            no_travel: noTravel,
            no_night_shifts: noNightShifts,
            no_own_car: noOwnCar,
            remote_only: remoteOnly,
            no_relocation: noRelocation,
            no_overtime: noOvertime,
            no_commission_only: noCommissionOnly,
          },
          // ── 0112 structured matching extras ───────────────────────────────
          skills,
          languages_proficiency: languagesProficiency.length > 0
            ? languagesProficiency
            : languages.map((code) => ({ code, level: 'conversational' as const })),
          available_shifts: availableShifts,
          available_days_per_week: availableDaysPerWeek === '' ? null : availableDaysPerWeek,
          environment_preferences: environmentPreferences,
          candidate_types: candidateTypes,
          priority_concerns_text: priorityConcernsText.trim() || null,
          priority_concerns_atoms: priorityConcernsAtoms,
        }, { onConflict: 'profile_id' }).select('id').single()
        if (insErr) throw insErr
        talentIdRef.current = talentRow.id
        talentId = talentRow.id

        // 3. Best-effort metadata writes. Don't block on these.
        const docRows = [
          { talent_id: talentId, doc_type: 'resume', storage_path: resumePath, file_name: resumeFile!.name, purge_after: null },
          ...(clPath ? [{ talent_id: talentId, doc_type: 'cover_letter', storage_path: clPath, file_name: coverLetterFile!.name, purge_after: null }] : []),
        ]
        supabase.from('talent_documents').insert(docRows).then(() => { /* best-effort */ })
        supabase.from('profiles')
          .update({ interview_transcript: null })
          .eq('id', userId)
          .then(() => { /* best-effort */ })

        // 5a. If the talent typed non-negotiables but didn't preview, run extraction
        //     now and persist atoms. Best-effort; matcher works without atoms too.
        if (priorityConcernsText.trim() && priorityConcernsAtoms.length === 0) {
          void callFunction('extract-non-negotiables', {
            side: 'talent',
            text: priorityConcernsText.trim(),
            talent_id: talentId,
          }).catch(() => { /* best effort */ })
        }

        // 5. Kick the async extraction. Fire-and-forget — keepalive ensures it
        //    survives the navigation away from this page.
        try {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enqueue-talent-extraction`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ talent_id: talentId, messages: apiMessages, resume_text: resumeText }),
              keepalive: true,
            },
          )
        } catch (enqueueErr) {
          // Non-fatal: retry-stuck-extractions cron will pick it up.
          console.warn('[onboarding] enqueue-talent-extraction failed, will retry via cron:', enqueueErr)
        }

        // 6. Referral processing — best-effort.
        try {
          const code = localStorage.getItem('bole.referral_code') ?? sessionStorage.getItem('bole.referral_code')
          if (code) {
            fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-referral`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ referral_code: code, referred_user_id: userId }),
                keepalive: true,
              },
            ).catch(() => { /* best effort */ })
            localStorage.removeItem('bole.referral_code')
            sessionStorage.removeItem('bole.referral_code')
          }
        } catch { /* best effort */ }
      }

      // 4. PII update — must succeed. Runs on both first attempt and retry.
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() })
        .eq('id', userId)
      if (profErr) throw profErr

      await markOnboardingComplete(userId)

      if (draftKey) localStorage.removeItem(draftKey)

      useSession.setState((s) => ({
        profile: s.profile ? { ...s.profile, onboarding_complete: true } : s.profile,
      }))
      void refresh()
      if (draftKey) try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      setPhase('done')
      setTimeout(() => navigate('/talent', { replace: true, state: { extractionPending: true } }), 1200)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // ── composer per phase ───────────────────────────────────────────────────

  const composer = (() => {
    if (phase === 'resume') {
      const chatDone = apiMessages.length > 0
      const dobFilled = !!dob && !!gender && !!race && !!religion && languages.length > 0
      const nextPhase: Phase = chatDone ? (dobFilled ? 'docs' : 'dob') : 'chat'
      return (
        <div className="space-y-3">
          <p className="text-sm text-ink-700 font-medium">{t('talentOnboard.resumeProgressIntro')}</p>
          <div className="space-y-1.5">
            <ProgressStep label={t('talentOnboard.stepNameContact')} done={!!fullName} doneLabel={t('talentOnboard.stepDone')} nextLabel={t('talentOnboard.stepNext')} />
            <ProgressStep label={t('talentOnboard.stepChat')} done={chatDone} active={!chatDone} doneLabel={t('talentOnboard.stepDone')} nextLabel={t('talentOnboard.stepNext')} />
            <ProgressStep label={t('talentOnboard.stepBackgroundDob')} done={dobFilled} active={chatDone && !dobFilled} doneLabel={t('talentOnboard.stepDone')} nextLabel={t('talentOnboard.stepNext')} />
            <ProgressStep label={t('talentOnboard.stepDocuments')} done={false} active={dobFilled} doneLabel={t('talentOnboard.stepDone')} nextLabel={t('talentOnboard.stepNext')} />
          </div>
          <Button onClick={() => setPhase(nextPhase)} className="w-full mt-2" size="lg">
            {t('talentOnboard.continueWhereLeftOff')}
          </Button>
          <button
            type="button"
            className="w-full text-xs text-ink-400 hover:text-ink-600 py-1"
            onClick={() => {
              if (draftKey) localStorage.removeItem(draftKey)
              setPhase('basics')
              setFullName(''); setPhone(''); setDob(''); setGender('')
              setRace(''); setReligion(''); setLanguages([])
              setLocationMatters(null); setLocationPostcode(''); setOpenToNewField(false)
              setLog([]); setApiMessages([])
              chatInitRef.current = false
            }}
          >
            {t('talentOnboard.startOver')}
          </button>
        </div>
      )
    }

    if (phase === 'basics') {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (fullName.trim() && phone.trim()) {
            if (draftKey) localStorage.setItem(draftKey, JSON.stringify({ phase: 'chat', fullName: fullName.trim(), phone: phone.trim() }))
            setPhase('chat')
          }
          }}
          className="space-y-3"
        >
          <p className="text-sm text-ink-600">
            {t('talentOnboard.basicsIntro')}
          </p>
          <div>
            <label htmlFor="talent-onboard-full-name" className="block text-sm font-medium text-ink-700 mb-1">{t('common.fullName')}</label>
            <input
              id="talent-onboard-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('talentOnboard.fullNamePlaceholder')}
              // First wizard field; intentional focus on entry.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="talent-onboard-phone" className="block text-sm font-medium text-ink-700 mb-1">{t('common.phone')}</label>
            <input
              id="talent-onboard-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('talentOnboard.phonePlaceholder')}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <Button
            type="submit"
            disabled={!fullName.trim() || !phone.trim()}
            className="w-full"
            size="lg"
          >
            {t('talentOnboard.continueToChat')}
          </Button>
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => void handleSwitchToHiring()}
              disabled={switching}
              className="text-xs text-ink-400 hover:text-ink-600 underline"
            >
              {switching ? t('talentOnboard.switching') : t('talentOnboard.switchToHiring')}
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
            ref={chatInputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendMessage(input)
              }
            }}
            placeholder={
              isStreaming
                ? t('talentOnboard.chatTyping')
                : t('talentOnboard.chatPlaceholder')
            }
            rows={2}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-xl border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50"
            // Active chat surface — autoFocus when entering this step is intentional.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {isStreaming ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => abortCtrlRef.current?.abort()}
            >
              {t('talentOnboard.stop')}
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!input.trim()}
              size="sm"
            >
              {t('common.send')}
            </Button>
          )}
        </form>
      )
    }

    if (phase === 'dob') {
      return (
        <DobStep
          t={t}
          dob={dob} setDob={setDob}
          gender={gender} setGender={setGender}
          race={race} setRace={setRace}
          religion={religion} setReligion={setReligion}
          languages={languages} setLanguages={setLanguages}
          locationMatters={locationMatters} setLocationMatters={setLocationMatters}
          locationPostcode={locationPostcode} setLocationPostcode={setLocationPostcode}
          openToNewField={openToNewField} setOpenToNewField={setOpenToNewField}
          dobConsent={dobConsent} setDobConsent={setDobConsent}
          dobAttempted={dobAttempted} setDobAttempted={setDobAttempted}
          err={err} setErr={setErr}
          onValidContinue={() => setDobConfirmOpen(true)}
        />
      )
    }

    if (phase === 'dealbreakers') {
      const handleContinue = async () => {
        // Best-effort: classify free-text items into structured flags via AI
        if (dealBreakerItems.length > 0) {
          try {
            const result = await callFunction<{ deal_breakers: Record<string, boolean> }>('extract-deal-breakers', {
              items: dealBreakerItems, party: 'talent',
            })
            // Skip state updates if the user has already navigated away from this phase.
            if (phase !== 'dealbreakers') return
            const db = result?.deal_breakers ?? {}
            if (db.no_travel)         setNoTravel(true)
            if (db.no_night_shifts)   setNoNightShifts(true)
            if (db.no_own_car)        setNoOwnCar(true)
            if (db.remote_only)       setRemoteOnly(true)
            if (db.no_relocation)     setNoRelocation(true)
            if (db.no_overtime)       setNoOvertime(true)
            if (db.no_commission_only) setNoCommissionOnly(true)
          } catch { /* best effort — manual toggles still apply */ }
        }
        setPhase('extras')
      }
      return (
        <DealBreakersStep
          t={t}
          noWeekendWork={noWeekendWork} setNoWeekendWork={setNoWeekendWork}
          noDrivingLicense={noDrivingLicense} setNoDrivingLicense={setNoDrivingLicense}
          noTravel={noTravel} setNoTravel={setNoTravel}
          noNightShifts={noNightShifts} setNoNightShifts={setNoNightShifts}
          noOwnCar={noOwnCar} setNoOwnCar={setNoOwnCar}
          remoteOnly={remoteOnly} setRemoteOnly={setRemoteOnly}
          noRelocation={noRelocation} setNoRelocation={setNoRelocation}
          noOvertime={noOvertime} setNoOvertime={setNoOvertime}
          noCommissionOnly={noCommissionOnly} setNoCommissionOnly={setNoCommissionOnly}
          minSalaryHard={minSalaryHard} setMinSalaryHard={setMinSalaryHard}
          dealBreakerItems={dealBreakerItems} setDealBreakerItems={setDealBreakerItems}
          dealBreakerInput={dealBreakerInput} setDealBreakerInput={setDealBreakerInput}
          onContinue={() => void handleContinue()}
        />
      )
    }

    if (phase === 'extras') {
      return (
        <ExtrasStep
          t={t}
          skills={skills} setSkills={setSkills}
          languages={languages}
          languagesProficiency={languagesProficiency} setLanguagesProficiency={setLanguagesProficiency}
          candidateTypes={candidateTypes} setCandidateTypes={setCandidateTypes}
          availableDaysPerWeek={availableDaysPerWeek} setAvailableDaysPerWeek={setAvailableDaysPerWeek}
          availableShifts={availableShifts} setAvailableShifts={setAvailableShifts}
          environmentPreferences={environmentPreferences} setEnvironmentPreferences={setEnvironmentPreferences}
          priorityConcernsText={priorityConcernsText} setPriorityConcernsText={setPriorityConcernsText}
          priorityConcernsAtoms={priorityConcernsAtoms} setPriorityConcernsAtoms={setPriorityConcernsAtoms}
          onContinue={() => setPhase('docs')}
        />
      )
    }

    if (phase === 'docs') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            {t('talentOnboard.docsIntro')}
          </p>
          <FileRow
            label={t('talentOnboard.photoLabel')}
            accept="image/jpeg,image/png,image/webp"
            file={photoFile}
            onChange={setPhotoFile}
            hint={t('talentOnboard.photoHint')}
            maxBytes={2 * 1024 * 1024}
            required
            chooseLabel={t('talentOnboard.choose')}
            noFileLabel={t('talentOnboard.noFileSelected')}
            tooLargeLabel={(mb) => t('talentOnboard.fileTooLarge', { mb })}
          />
          <FileRow
            label={t('talentOnboard.resumeLabel')}
            accept="application/pdf,.doc,.docx"
            file={resumeFile}
            onChange={setResumeFile}
            maxBytes={10 * 1024 * 1024}
            required
            chooseLabel={t('talentOnboard.choose')}
            noFileLabel={t('talentOnboard.noFileSelected')}
            tooLargeLabel={(mb) => t('talentOnboard.fileTooLarge', { mb })}
          />
          <FileRow
            label={t('talentOnboard.coverLetterLabel')}
            accept="application/pdf,.doc,.docx"
            file={coverLetterFile}
            onChange={setCoverLetterFile}
            maxBytes={10 * 1024 * 1024}
            chooseLabel={t('talentOnboard.choose')}
            noFileLabel={t('talentOnboard.noFileSelected')}
            tooLargeLabel={(mb) => t('talentOnboard.fileTooLarge', { mb })}
          />
          <p className="text-xs text-ink-500 italic">
            {t('talentOnboard.nricNote')}
          </p>
          {err && <Alert tone="red">{err}</Alert>}
          <Button
            onClick={() => setPhase('review')}
            disabled={!photoFile || !resumeFile}
            className="w-full"
            size="lg"
          >
            {t('talentOnboard.reviewConfirm')}
          </Button>
        </div>
      )
    }

    if (phase === 'review') {
      return (
        <ReviewStep
          t={t}
          dob={dob} gender={gender} race={race} religion={religion} languages={languages}
          locationMatters={locationMatters} locationPostcode={locationPostcode}
          noWeekendWork={noWeekendWork} noDrivingLicense={noDrivingLicense}
          noTravel={noTravel} noNightShifts={noNightShifts} noOwnCar={noOwnCar}
          remoteOnly={remoteOnly} noRelocation={noRelocation} noOvertime={noOvertime}
          noCommissionOnly={noCommissionOnly} minSalaryHard={minSalaryHard}
          photoFile={photoFile} resumeFile={resumeFile} coverLetterFile={coverLetterFile}
          err={err} busy={busy}
          onBuild={() => { setPhase('submit'); void finalise() }}
          onBack={() => { setErr(null); setPhase('docs') }}
        />
      )
    }

    if (phase === 'submit') {
      return (
        <div className="space-y-4 text-center py-2">
          {err ? (
            <>
              <Alert tone="red">{err}</Alert>
              <Button onClick={() => void finalise()} loading={busy} className="w-full">
                {t('talentOnboard.retry')}
              </Button>
              <button
                type="button"
                onClick={() => { setErr(null); setPhase('review') }}
                className="w-full text-xs text-ink-400 hover:text-ink-600 py-1"
              >{t('talentOnboard.backToReview')}</button>
            </>
          ) : (
            <>
              <div className="flex justify-center">
                <svg className="animate-spin h-8 w-8 text-brand-500" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <p className="text-base font-medium text-ink-800">{t('talentOnboard.savingProfile')}</p>
              <p className="text-sm text-ink-500 leading-relaxed max-w-xs mx-auto">
                {t('talentOnboard.savingProfileHint')}
              </p>
            </>
          )}
        </div>
      )
    }

    return <div />
  })()

  const headline =
    phase === 'resume'       ? t('talentOnboard.headlineWelcomeBack') :
    phase === 'basics'       ? t('talentOnboard.headlineAboutYou') :
    phase === 'chat'         ? t('talentOnboard.headlineChat') :
    phase === 'dob'          ? t('talentOnboard.headlineAboutYou') :
    phase === 'dealbreakers' ? t('talentOnboard.headlineNonNegotiables') :
    phase === 'extras'       ? t('talentOnboard.headlineMoreAboutYou') :
    phase === 'docs'         ? t('talentOnboard.headlineDocuments') :
    phase === 'review'       ? t('talentOnboard.headlineReview') :
    phase === 'submit' || phase === 'done' ? t('talentOnboard.headlineFinishing') : ''

  const progressPct =
    phase === 'resume'       ? 10 :
    phase === 'basics'       ? 5 :
    phase === 'chat'         ? 30 :
    phase === 'dob'          ? 65 :
    phase === 'dealbreakers' ? 75 :
    phase === 'extras'       ? 85 :
    phase === 'docs'         ? 90 :
    phase === 'review'       ? 95 :
    phase === 'submit'       ? 97 : 100

  const DiamondPointsInfo = phase === 'basics' ? (
    <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <span className="font-semibold">{t('talentOnboard.freeMatchesBold')}</span>{' '}
      {t('talentOnboard.freeMatchesBody')}
      {' '}<span className="font-semibold">{t('talentOnboard.freeMatchesRate')}</span>
    </div>
  ) : null

  return (
    <>
      {DiamondPointsInfo}
      <ChatShell messages={log} input={composer} headline={headline} progressPct={progressPct} formMode={phase !== 'chat'} />
      {dobConfirmOpen && (
        <DobConfirmModal
          dob={dob}
          onConfirm={() => { setDobConfirmOpen(false); setPhase('dealbreakers') }}
          onCancel={() => setDobConfirmOpen(false)}
        />
      )}
    </>
  )
}
