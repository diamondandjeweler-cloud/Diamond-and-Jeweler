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
import { useEffect, useId, useRef, useState } from 'react'
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
import Consent from '../../components/Consent'

type Phase = 'basics' | 'chat' | 'dob' | 'dealbreakers' | 'docs' | 'review' | 'submit' | 'done' | 'resume'

interface ApiMessage { role: 'user' | 'assistant'; content: string }

const BO_GREETING =
  "Hey there! I'm DNJ, your career buddy. Let's keep this easy — just a few quick questions to get a feel for what you're after. Nothing heavy, I promise.\n\nTo kick things off: what kind of role are you hoping to land next? Even a rough idea works perfectly."

export default function TalentOnboarding() {
  const { session, refresh } = useSession()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('basics')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [log, setLog] = useState<ChatMessage[]>([])
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortCtrlRef = useRef<AbortController | null>(null)
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
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

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
  const insertedRef = useRef(false)
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
      }) : null

      const restoredName = draft?.fullName || (prof?.full_name as string | null) || ''
      const restoredPhone = draft?.phone || (prof?.phone as string | null) || ''

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
        if (draft?.gender) setGender(draft.gender as Gender)
        if (draft?.race) setRace(draft.race)
        if (draft?.religion) setReligion(draft.religion)
        if (draft?.languages?.length) setLanguages(draft.languages)
        if (draft?.locationMatters != null) setLocationMatters(draft.locationMatters)
        if (draft?.locationPostcode) setLocationPostcode(draft.locationPostcode)
        if (draft?.openToNewField != null) setOpenToNewField(draft.openToNewField)
        setPhase('resume')
      } else if (draft?.fullName && draft.phase && draft.phase !== 'basics') {
        // Partial progress in a later phase.
        setFullName(draft.fullName)
        if (draft.phone) setPhone(draft.phone)
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
  useEffect(() => {
    if (!draftKey || phase === 'basics' || phase === 'resume' || phase === 'done' || phase === 'submit') return
    // DOB intentionally excluded — never persisted to localStorage in plaintext.
    localStorage.setItem(draftKey, JSON.stringify({
      phase, fullName, phone, gender: gender || '',
      race, religion, languages, locationMatters, locationPostcode, openToNewField,
    }))
  }, [draftKey, phase, fullName, phone, gender, race, religion, languages, locationMatters, locationPostcode, openToNewField])

  // Seed Bo's greeting when entering the chat phase — no API call needed.
  useEffect(() => {
    if (phase !== 'chat' || chatInitRef.current) return
    chatInitRef.current = true
    setLog([{ id: nextId(), from: 'system', content: BO_GREETING }])
    setApiMessages([{ role: 'assistant', content: BO_GREETING }])
  }, [phase])

  function computeUsesLunarCalendar(r: string, rel: string, langs: string[]): boolean {
    if (r !== 'chinese') return false
    if (!['buddhism', 'taoism', 'chinese_folk'].includes(rel)) return false
    return langs.some((l) => ['mandarin', 'cantonese', 'hokkien', 'hakka', 'teochew'].includes(l))
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
            content:
              "Two more quick things — your date of birth (encrypted, never shown to employers) and your documents. Then you're all set.",
          },
        ])
        setTimeout(() => setPhase('dob'), 600)
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (isAbort && accumulated.trim()) {
        const partialMsgs: ApiMessage[] = [...newApiMsgs, { role: 'assistant', content: accumulated }]
        setApiMessages(partialMsgs)
        supabase.from('profiles')
          .update({ interview_transcript: { messages: partialMsgs, saved_at: new Date().toISOString(), partial: true } })
          .eq('id', session!.user.id)
          .then(() => {})
        setLog((l) => [
          ...l.map((m) => m.id === boId ? { ...m, typing: false } : m),
          { id: nextId(), from: 'system', content: 'Progress saved. Feel free to continue whenever you\'re ready.' },
        ])
      } else if (isAbort) {
        setLog((l) => l.map((m) => m.id === boId ? { ...m, content: '', typing: false } : m))
      } else {
        setLog((l) =>
          l.map((m) =>
            m.id === boId
              ? { ...m, content: 'Something went wrong. Please try again.', typing: false }
              : m,
          ),
        )
      }
    } finally {
      setIsStreaming(false)
    }
  }

  async function finalise() {
    if (!session) return
    if (insertedRef.current) {
      navigate('/talent', { replace: true, state: { extractionPending: true } })
      return
    }
    setErr(null)
    setBusy(true)
    try {
      const userId = session.user.id

      // 1. Upload files + encrypt DOB in parallel. Fast (seconds, not minutes).
      const [resumePath, clPath, photoPath, dobEncrypted] = await Promise.all([
        uploadPrivate('resumes', resumeFile!, userId, resumeFile!.name),
        coverLetterFile
          ? uploadPrivate('resumes', coverLetterFile, userId, `cover-letter-${coverLetterFile.name}`)
          : Promise.resolve<string | null>(null),
        uploadPrivate('talent-photos', photoFile!, userId, photoFile!.name),
        encryptDob(dob),
      ])

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

      // 2. Insert the talents row WITHOUT extracted fields. The async worker
      //    fills those in and flips is_open_to_offers=true on completion.
      //    Hidden from matching until then via the existing partial indexes.
      const { data: talentRow, error: insErr } = await supabase.from('talents').insert({
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
      }).select('id').single()
      if (insErr) throw insErr
      // Mark as inserted before any further work — protects against retry / refresh
      // hitting the talents.profile_id UNIQUE constraint and looping the user.
      insertedRef.current = true
      const talentId: string = talentRow.id

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

      // 4. PII update — must succeed.
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() })
        .eq('id', userId)
      if (profErr) throw profErr

      await markOnboardingComplete(userId)

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

      if (draftKey) localStorage.removeItem(draftKey)

      useSession.setState((s) => ({
        profile: s.profile ? { ...s.profile, onboarding_complete: true } : s.profile,
      }))
      void refresh()
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
          <p className="text-sm text-ink-700 font-medium">Welcome back — here's your progress:</p>
          <div className="space-y-1.5">
            <ProgressStep label="Name & contact" done={!!fullName} />
            <ProgressStep label="Chat with DNJ" done={chatDone} active={!chatDone} />
            <ProgressStep label="Background & date of birth" done={dobFilled} active={chatDone && !dobFilled} />
            <ProgressStep label="Documents" done={false} active={dobFilled} />
          </div>
          <Button onClick={() => setPhase(nextPhase)} className="w-full mt-2" size="lg">
            Continue where I left off
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
            Start over instead
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
            Before we start — just your name and a contact number. These stay on our servers and are never shared with AI systems.
          </p>
          <div>
            <label htmlFor="talent-onboard-full-name" className="block text-sm font-medium text-ink-700 mb-1">Full name</label>
            <input
              id="talent-onboard-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              // First wizard field; intentional focus on entry.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="talent-onboard-phone" className="block text-sm font-medium text-ink-700 mb-1">Phone number</label>
            <input
              id="talent-onboard-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+60 12-345 6789"
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <Button
            type="submit"
            disabled={!fullName.trim() || !phone.trim()}
            className="w-full"
            size="lg"
          >
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
                ? 'BoLe is typing…'
                : 'Type your message… (Shift + Enter for new line)'
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
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!input.trim()}
              size="sm"
            >
              Send
            </Button>
          )}
        </form>
      )
    }

    if (phase === 'dob') {
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <strong>Date of birth is required.</strong> We use it to find roles where you&apos;ll
            thrive at this stage of your career. Without it we cannot produce matches and the
            platform serves no purpose for you. DOB is encrypted at rest and is{' '}
            <strong>never shown</strong> to employers or other users.
          </div>
          <p className="text-xs text-ink-500">
            You must be <strong>18 or older</strong> to use DNJ.
          </p>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10)}
            className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Gender:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`border rounded-lg px-3 py-2 text-sm ${gender === 'male' ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >
                Male
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`border rounded-lg px-3 py-2 text-sm ${gender === 'female' ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >
                Female
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Race / ethnicity:</p>
            <div className="grid grid-cols-2 gap-2">
              {(['Malay', 'Chinese', 'Indian', 'Others'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRace(r.toLowerCase())}
                  className={`border rounded-lg px-3 py-2 text-sm ${race === r.toLowerCase() ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Religion:</p>
            <select
              value={religion}
              onChange={(e) => setReligion(e.target.value)}
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
            <p className="text-sm text-ink-600">Languages you can speak (select all that apply):</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'english', label: 'English' },
                { value: 'bahasa_malaysia', label: 'Bahasa Malaysia' },
                { value: 'mandarin', label: 'Mandarin' },
                { value: 'cantonese', label: 'Cantonese' },
                { value: 'hokkien', label: 'Hokkien' },
                { value: 'hakka', label: 'Hakka' },
                { value: 'teochew', label: 'Teochew' },
                { value: 'tamil', label: 'Tamil' },
                { value: 'others', label: 'Others' },
              ].map(({ value, label }) => {
                const active = languages.includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLanguages((prev) => active ? prev.filter((l) => l !== value) : [...prev, value])}
                    className={`border rounded-full px-3 py-1.5 text-xs ${active ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Does commute distance matter to you?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLocationMatters(true)}
                className={`border rounded-lg px-3 py-2 text-sm ${locationMatters === true ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >
                Yes — keep nearby
              </button>
              <button
                type="button"
                onClick={() => { setLocationMatters(false); setLocationPostcode('') }}
                className={`border rounded-lg px-3 py-2 text-sm ${locationMatters === false ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
              >
                No, I can travel
              </button>
            </div>
            {locationMatters === true && (
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{5}"
                maxLength={5}
                value={locationPostcode}
                onChange={(e) => setLocationPostcode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Your 5-digit postcode (e.g. 50450)"
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>
          <label htmlFor="talent-onboard-open-new-field" className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              id="talent-onboard-open-new-field"
              type="checkbox"
              checked={openToNewField}
              onChange={(e) => setOpenToNewField(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-ink-900">I&apos;m open to trying a new field.</span>
              <span className="block text-xs text-ink-500 mt-0.5">
                We&apos;ll surface part-time / gig / internship roles outside your background. Full-time roles still favour your past experience.
              </span>
            </span>
          </label>
          <Consent
            checked={dobConsent}
            onChange={setDobConsent}
            label="I agree to share my date of birth with DNJ to help find roles where I'll thrive. Encrypted and never shown to employers."
            required
          />
          <Button
            onClick={() => {
              // Server-side belt: also enforce 18+ here in case max attribute is bypassed.
              if (dob) {
                const dobMs = new Date(dob).getTime()
                const eighteenYrsAgoMs = Date.now() - 18 * 365.25 * 86400000
                if (dobMs > eighteenYrsAgoMs) {
                  setErr('You must be at least 18 years old to use DNJ.')
                  return
                }
              }
              setErr(null)
              setDobConfirmOpen(true)
            }}
            disabled={
              !dob || !gender || locationMatters === null
              || (locationMatters === true && locationPostcode.length !== 5)
              || !race || !religion || languages.length === 0
              || !dobConsent
            }
            className="w-full"
            size="lg"
          >
            Continue
          </Button>
          {err && <Alert tone="red">{err}</Alert>}
        </div>
      )
    }

    if (phase === 'dealbreakers') {
      const addItem = () => {
        const t = dealBreakerInput.trim()
        if (!t || dealBreakerItems.includes(t)) return
        setDealBreakerItems((prev) => [...prev, t])
        setDealBreakerInput('')
      }
      const hasAnyDealBreaker = noWeekendWork || noDrivingLicense || minSalaryHard != null || dealBreakerItems.length > 0 || noTravel || noNightShifts || noOwnCar || remoteOnly || noRelocation || noOvertime || noCommissionOnly

      const handleContinue = async () => {
        // Best-effort: classify free-text items into structured flags via AI
        if (dealBreakerItems.length > 0) {
          try {
            const result = await callFunction<{ deal_breakers: Record<string, boolean> }>('extract-deal-breakers', {
              items: dealBreakerItems, party: 'talent',
            })
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
        setPhase('docs')
      }
      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            Tell us your non-negotiables — things you will <strong>not</strong> compromise on.
            Roles that conflict with these will be filtered out automatically.
          </p>

          {/* Quick structured toggles — machine-verified hard filters */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">Quick filters (auto-enforced)</p>
            <label className="flex items-center gap-3 border border-ink-200 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 transition-colors">
              <input
                type="checkbox"
                checked={noWeekendWork}
                onChange={(e) => setNoWeekendWork(e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 accent-brand-500"
              />
              <span className="text-sm text-ink-800">I cannot work weekends</span>
            </label>
            <label className="flex items-center gap-3 border border-ink-200 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 transition-colors">
              <input
                type="checkbox"
                checked={noDrivingLicense}
                onChange={(e) => setNoDrivingLicense(e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 accent-brand-500"
              />
              <span className="text-sm text-ink-800">I do not have a driving licence</span>
            </label>
            {[
              { state: noTravel,         setter: setNoTravel,         label: 'I cannot travel for work' },
              { state: noNightShifts,    setter: setNoNightShifts,    label: 'I cannot work night shifts' },
              { state: noOwnCar,         setter: setNoOwnCar,         label: "I don't have my own car / transport" },
              { state: remoteOnly,       setter: setRemoteOnly,       label: 'Remote or hybrid only — no full-time office' },
              { state: noRelocation,     setter: setNoRelocation,     label: 'I cannot relocate' },
              { state: noOvertime,       setter: setNoOvertime,       label: 'No overtime — strict working hours only' },
              { state: noCommissionOnly, setter: setNoCommissionOnly, label: 'No commission-only or variable-pay-only roles' },
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
            <div className="border border-ink-200 rounded-lg px-3 py-2.5">
              <label htmlFor="talent-onboard-min-salary" className="block text-sm text-ink-800 mb-1.5">Minimum salary I will accept (RM / month)</label>
              <div className="flex items-center gap-2">
                <input
                  id="talent-onboard-min-salary"
                  type="number"
                  min={0}
                  step={100}
                  value={minSalaryHard ?? ''}
                  onChange={(e) => setMinSalaryHard(e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="e.g. 4000  (leave blank if flexible)"
                  className="flex-1 border border-ink-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {minSalaryHard != null && (
                  <button
                    type="button"
                    onClick={() => setMinSalaryHard(null)}
                    className="text-ink-400 hover:text-red-500 text-base leading-none"
                    aria-label="Clear"
                  >×</button>
                )}
              </div>
            </div>
          </div>

          {/* Free-text additional requirements */}
          <div>
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Anything else (optional)</p>
            <p className="text-xs text-ink-400 mb-2">e.g. "Must be hybrid or remote", "No night shifts", "Company must provide transport"</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={dealBreakerInput}
                onChange={(e) => setDealBreakerInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                placeholder="Type a requirement and press Enter or Add"
                className="flex-1 border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={addItem}
                disabled={!dealBreakerInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white disabled:opacity-40 hover:bg-brand-600 transition-colors shrink-0"
              >
                Add
              </button>
            </div>
          </div>

          {/* Free-text list */}
          {dealBreakerItems.length > 0 && (
            <ul className="space-y-2">
              {dealBreakerItems.map((item) => (
                <li key={item} className="flex items-start gap-2 bg-ink-50 border border-ink-200 rounded-lg px-3 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                  <span className="flex-1 text-sm text-ink-800">{item}</span>
                  <button
                    type="button"
                    onClick={() => setDealBreakerItems((prev) => prev.filter((i) => i !== item))}
                    className="text-ink-400 hover:text-red-500 transition-colors shrink-0 text-base leading-none"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!hasAnyDealBreaker && (
            <p className="text-xs text-ink-400 text-center py-1">No non-negotiables set — you can skip this if you're flexible.</p>
          )}

          <Button
            onClick={() => void handleContinue()}
            className="w-full"
            size="lg"
          >
            {hasAnyDealBreaker ? 'Continue' : "Skip — I'm flexible"}
          </Button>
        </div>
      )
    }

    if (phase === 'docs') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Last step — upload your documents. Only you and verified employers can see these.
          </p>
          <FileRow
            label="Passport-size photo"
            accept="image/jpeg,image/png,image/webp"
            file={photoFile}
            onChange={setPhotoFile}
            hint="JPG or PNG, max 2 MB. Used on your candidate profile."
            required
          />
          <FileRow
            label="Résumé (PDF or Word)"
            accept="application/pdf,.doc,.docx"
            file={resumeFile}
            onChange={setResumeFile}
            required
          />
          <FileRow
            label="Cover letter (optional)"
            accept="application/pdf,.doc,.docx"
            file={coverLetterFile}
            onChange={setCoverLetterFile}
          />
          <p className="text-xs text-ink-500 italic">
            Note: We do not require NRIC or passport scans. An optional Identity-Verification
            Badge will be available later.
          </p>
          {err && <Alert tone="red">{err}</Alert>}
          <Button
            onClick={() => setPhase('review')}
            disabled={!photoFile || !resumeFile}
            className="w-full"
            size="lg"
          >
            Review &amp; confirm
          </Button>
        </div>
      )
    }

    if (phase === 'review') {
      const activeConstraints = [
        noWeekendWork && 'No weekend work',
        noDrivingLicense && 'No driving licence required',
        noTravel && 'No travel',
        noNightShifts && 'No night shifts',
        noOwnCar && 'No own car required',
        remoteOnly && 'Remote / hybrid only',
        noRelocation && 'No relocation',
        noOvertime && 'No overtime',
        noCommissionOnly && 'No commission-only pay',
      ].filter(Boolean) as string[]

      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            Here's what we've captured. Take a moment to review — when you click <strong>Build my profile</strong> we'll save it right away and finish analysing in the background.
          </p>

          <ReviewRow label="Chat" value="Completed ✓" ok />
          <ReviewRow label="Date of birth" value={dob ? `${dob} (encrypted)` : '—'} ok={!!dob} />
          <ReviewRow label="Gender" value={gender || '—'} ok={!!gender} />
          <ReviewRow label="Race" value={race || '—'} ok={!!race} />
          <ReviewRow label="Religion" value={religion || '—'} ok={!!religion} />
          <ReviewRow label="Languages" value={languages.length > 0 ? languages.join(', ') : '—'} ok={languages.length > 0} />
          <ReviewRow label="Location" value={locationMatters === true ? `Postcode ${locationPostcode}` : locationMatters === false ? 'Flexible' : '—'} ok={locationMatters !== null} />
          <ReviewRow
            label="Hard constraints"
            value={activeConstraints.length > 0 ? activeConstraints.join(' · ') : 'None set'}
            ok
          />
          {minSalaryHard != null && (
            <ReviewRow label="Minimum salary" value={`RM ${minSalaryHard.toLocaleString()} / month`} ok />
          )}
          <ReviewRow label="Photo" value={photoFile?.name ?? '—'} ok={!!photoFile} />
          <ReviewRow label="Résumé" value={resumeFile?.name ?? '—'} ok={!!resumeFile} />
          {coverLetterFile && <ReviewRow label="Cover letter" value={coverLetterFile.name} ok />}

          {err && <Alert tone="red">{err}</Alert>}
          <Button
            onClick={() => { setPhase('submit'); void finalise() }}
            loading={busy}
            className="w-full"
            size="lg"
          >
            Build my profile
          </Button>
          <button
            type="button"
            onClick={() => setPhase('docs')}
            className="w-full text-xs text-ink-400 hover:text-ink-600 py-1"
          >
            ← Go back and change something
          </button>
        </div>
      )
    }

    if (phase === 'submit') {
      return (
        <div className="space-y-4 text-center py-2">
          {err ? (
            <>
              <Alert tone="red">{err}</Alert>
              <Button onClick={() => void finalise()} loading={busy} className="w-full">
                Retry
              </Button>
            </>
          ) : (
            <>
              <div className="flex justify-center">
                <svg className="animate-spin h-8 w-8 text-brand-500" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <p className="text-base font-medium text-ink-800">Saving your profile…</p>
              <p className="text-sm text-ink-500 leading-relaxed max-w-xs mx-auto">
                Just a few seconds — uploading your files and locking in your answers. Our AI will finish your summary in the background.
              </p>
            </>
          )}
        </div>
      )
    }

    return <div />
  })()

  const headline =
    phase === 'resume'       ? 'Welcome back' :
    phase === 'basics'       ? 'About you' :
    phase === 'chat'         ? 'Chat with DNJ' :
    phase === 'dob'          ? 'About you' :
    phase === 'dealbreakers' ? 'Your non-negotiables' :
    phase === 'docs'         ? 'Your documents' :
    phase === 'review'       ? 'Review your profile' :
    phase === 'submit' || phase === 'done' ? 'Finishing up…' : ''

  const progressPct =
    phase === 'resume'       ? 10 :
    phase === 'basics'       ? 5 :
    phase === 'chat'         ? 30 :
    phase === 'dob'          ? 65 :
    phase === 'dealbreakers' ? 80 :
    phase === 'docs'         ? 90 :
    phase === 'review'       ? 95 :
    phase === 'submit'       ? 97 : 100

  const DiamondPointsInfo = phase === 'basics' ? (
    <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <span className="font-semibold">You get 3 free matches.</span>{' '}
      Earn Diamond Points by giving feedback, completing interviews, and referring friends — or buy more.
      {' '}<span className="font-semibold">21 Diamond Points = 1 extra match.</span>
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

// ── ProgressStep ─────────────────────────────────────────────────────────────

function ProgressStep({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
      active ? 'bg-brand-50 border-brand-200' : 'border-transparent'
    }`}>
      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
        done ? 'bg-emerald-500' : active ? 'bg-brand-500' : 'bg-ink-200'
      }`}>
        {done ? (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div className={`h-2 w-2 rounded-full ${active ? 'bg-white' : 'bg-ink-400'}`} />
        )}
      </div>
      <span className={`text-sm flex-1 ${done ? 'text-emerald-700' : active ? 'text-brand-700 font-medium' : 'text-ink-500'}`}>
        {label}
      </span>
      {done && <span className="text-xs text-emerald-600 font-medium">Done ✓</span>}
      {active && <span className="text-xs text-brand-600 font-medium">Next →</span>}
    </div>
  )
}

// ── FileRow ──────────────────────────────────────────────────────────────────

function FileRow({
  label,
  accept,
  file,
  onChange,
  required,
  hint,
}: {
  label: string
  accept: string
  file: File | null
  onChange: (f: File | null) => void
  required?: boolean
  hint?: string
}) {
  const inputId = useId()
  return (
    <label htmlFor={inputId} className="block border border-dashed border-ink-300 rounded-lg p-3 hover:border-ink-400 transition cursor-pointer bg-white">

      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-ink-100 flex items-center justify-center text-ink-500 shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z M14 3v6h6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink-900">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </div>
          <div className="text-xs text-ink-500 truncate">
            {file ? file.name : (hint ?? 'No file selected')}
          </div>
        </div>
        <span className="btn-secondary btn-sm pointer-events-none shrink-0">Choose</span>
      </div>
      <input
        id={inputId}
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
    </label>
  )
}

// ── ReviewRow ─────────────────────────────────────────────────────────────────

function ReviewRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
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
