/**
 * TalentOnboarding — AI-powered chat onboarding.
 *
 * Phases:
 *   basics — structured form: name + phone (never sent to AI)
 *   chat   — Bo (Claude) career conversation, ends with [PROFILE_READY]
 *   dob    — structured date input (encrypted for BaZi matching)
 *   docs   — IC + résumé upload
 *   submit — extract profile from transcript, upload files, insert talents row
 *   done   — redirect to /talent
 *
 * PDPA: name/phone collected locally via form, stored directly to Supabase.
 * They are never forwarded to the chat-onboard Edge Function or any external AI.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { uploadPrivate } from '../../lib/storage'
import { encryptDob, markOnboardingComplete } from '../../lib/api'
import { getLifeChartCharacter, type Gender } from '../../lib/lifeChartCharacter'
import ChatShell, { ChatMessage } from '../../components/ChatShell'
import { Button, Alert } from '../../components/ui'

type Phase = 'basics' | 'chat' | 'dob' | 'dealbreakers' | 'docs' | 'submit' | 'done' | 'resume'

interface ApiMessage { role: 'user' | 'assistant'; content: string }

const BO_GREETING =
  "Hi! I'm Bole — your career advisor for DNJ. I'm here to learn about your career so we can match you with employers who are genuinely a good fit.\n\nLet's start: what type of role and job scope are you targeting? Even something rough is fine — I'll help you sharpen it."

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
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [locationMatters, setLocationMatters] = useState<boolean | null>(null)
  const [locationPostcode, setLocationPostcode] = useState('')
  const [openToNewField, setOpenToNewField] = useState(false)
  const [icFile, setIcFile] = useState<File | null>(null)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null)
  const [race, setRace] = useState('')
  const [religion, setReligion] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [minSalary, setMinSalary] = useState<string>('')
  const [noWorkDays, setNoWorkDays] = useState<string[]>([])
  const [okayWithAfterHours, setOkayWithAfterHours] = useState<boolean | null>(null)
  const [hasDrivingLicense, setHasDrivingLicense] = useState<boolean | null>(null)
  const [highestQualification, setHighestQualification] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const idRef = useRef(0)
  const nextId = () => `m${++idRef.current}`
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
        phase?: Phase; fullName?: string; phone?: string; dob?: string; gender?: string
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
        if (draft?.dob) setDob(draft.dob)
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
    localStorage.setItem(draftKey, JSON.stringify({
      phase, fullName, phone, dob, gender: gender || '',
      race, religion, languages, locationMatters, locationPostcode, openToNewField,
    }))
  }, [draftKey, phase, fullName, phone, dob, gender, race, religion, languages, locationMatters, locationPostcode, openToNewField])

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

    try {
      const { data: authData } = await supabase.auth.getSession()
      const token = authData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-onboard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ messages: newApiMsgs }),
        },
      )
      if (!res.ok) throw new Error(`Server error ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
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
    } catch {
      setLog((l) =>
        l.map((m) =>
          m.id === boId
            ? { ...m, content: 'Something went wrong. Please try again.', typing: false }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
    }
  }

  async function finalise() {
    if (!session) return
    if (insertedRef.current) {
      navigate('/talent', { replace: true })
      return
    }
    setErr(null)
    setBusy(true)
    try {
      const userId = session.user.id

      const [icPath, resumePath, clPath, photoPath, dobEncrypted] = await Promise.all([
        uploadPrivate('ic-documents', icFile!, userId, icFile!.name),
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

      const extAbort = new AbortController()
      const extTimeout = setTimeout(() => extAbort.abort(), 120_000)
      let extRes: Response
      try {
        extRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-talent-profile`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ messages: apiMessages }),
            signal: extAbort.signal,
          },
        )
      } catch (fetchErr) {
        if ((fetchErr as Error).name === 'AbortError') {
          throw new Error('Profile extraction timed out — please retry.')
        }
        throw fetchErr
      } finally {
        clearTimeout(extTimeout)
      }
      if (!extRes.ok) throw new Error(`Profile extraction failed (${extRes.status})`)
      const extracted = await extRes.json() as {
        job_areas: string[]
        key_skills: string[]
        years_experience: number | null
        career_goals: string | null
        salary_min: number | null
        salary_max: number | null
        derived_tags: Record<string, number>
        wants_wlb: number
        wants_fair_pay: number
        wants_growth: number
        wants_stability: number
        wants_flexibility: number
        wants_recognition: number
        wants_mission: number
        wants_team_culture: number
        summary: string | null
      }

      const allTags: Record<string, number> = {
        ...extracted.derived_tags,
        wants_wlb: extracted.wants_wlb ?? 0,
        wants_fair_pay: extracted.wants_fair_pay ?? 0,
        wants_growth: extracted.wants_growth ?? 0,
        wants_stability: extracted.wants_stability ?? 0,
        wants_flexibility: extracted.wants_flexibility ?? 0,
        wants_recognition: extracted.wants_recognition ?? 0,
        wants_mission: extracted.wants_mission ?? 0,
        wants_team_culture: extracted.wants_team_culture ?? 0,
      }

      const lifeChartCharacter = gender
        ? getLifeChartCharacter(dob, gender)
        : null

      const { data: talentRow, error: insErr } = await supabase.from('talents').insert({
        profile_id: userId,
        date_of_birth_encrypted: dobEncrypted,
        gender: gender || null,
        life_chart_character: lifeChartCharacter,
        location_matters: locationMatters === true,
        location_postcode: locationMatters && locationPostcode.trim() ? locationPostcode.trim() : null,
        open_to_new_field: openToNewField,
        parsed_resume: {
          key_skills: extracted.key_skills,
          job_areas: extracted.job_areas,
          years_experience: extracted.years_experience,
          career_goals: extracted.career_goals,
          ai_summary: extracted.summary,
        },
        interview_answers: { transcript: apiMessages },
        derived_tags: allTags,
        expected_salary_min: extracted.salary_min,
        expected_salary_max: extracted.salary_max,
        race: race || null,
        religion: religion || null,
        languages,
        uses_lunar_calendar: computeUsesLunarCalendar(race, religion, languages),
        is_open_to_offers: true,
        photo_url: photoPath,
        has_driving_license: hasDrivingLicense,
        highest_qualification: highestQualification || null,
        deal_breakers: {
          min_salary: minSalary ? parseInt(minSalary, 10) : null,
          no_work_days: noWorkDays,
          okay_with_after_hours: okayWithAfterHours,
        },
      }).select('id').single()
      if (insErr) throw insErr
      insertedRef.current = true

      // Store documents in the separate talent_documents table.
      const icPurge = new Date(Date.now() + 30 * 86400000).toISOString()
      const docRows = [
        { talent_id: talentRow.id, doc_type: 'ic', storage_path: icPath, file_name: icFile!.name, purge_after: icPurge },
        { talent_id: talentRow.id, doc_type: 'resume', storage_path: resumePath, file_name: resumeFile!.name, purge_after: null },
        ...(clPath ? [{ talent_id: talentRow.id, doc_type: 'cover_letter', storage_path: clPath, file_name: coverLetterFile!.name, purge_after: null }] : []),
      ]
      supabase.from('talent_documents').insert(docRows).then(() => { /* best-effort */ })

      // Clear the chat draft now that it's safely in the talents row.
      supabase.from('profiles')
        .update({ interview_transcript: null })
        .eq('id', userId)
        .then(() => { /* best-effort */ })

      // Update profile with PII collected locally — never sent to AI.
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() })
        .eq('id', userId)
      if (profErr) throw profErr

      await markOnboardingComplete(userId)

      try {
        const code = localStorage.getItem('bole.referral_code')
        if (code) {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-referral`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ referral_code: code, referred_user_id: userId }),
            },
          )
          localStorage.removeItem('bole.referral_code')
        }
      } catch { /* best effort */ }

      // Clear the onboarding draft now that everything is saved.
      if (draftKey) localStorage.removeItem(draftKey)

      // Update local store immediately so navigation isn't blocked by a slow refresh.
      useSession.setState((s) => ({
        profile: s.profile ? { ...s.profile, onboarding_complete: true } : s.profile,
      }))
      void refresh()
      setPhase('done')
      setTimeout(() => navigate('/talent', { replace: true }), 1600)
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
            <ProgressStep label="Chat with Bole" done={chatDone} active={!chatDone} />
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
            <label className="block text-sm font-medium text-ink-700 mb-1">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              autoFocus
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Phone number</label>
            <input
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
            Continue to chat with Bole
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void sendMessage(input)
              }
            }}
            placeholder={
              isStreaming
                ? 'Bo is typing…'
                : 'Type your message… (Cmd / Ctrl + Enter to send)'
            }
            rows={2}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-xl border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50"
            autoFocus
          />
          <Button
            type="submit"
            disabled={isStreaming || !input.trim()}
            size="sm"
          >
            Send
          </Button>
        </form>
      )
    }

    if (phase === 'dob') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            What's your date of birth? We encrypt it and use it only for AI-powered compatibility analysis — never shown to employers.
          </p>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            max={new Date(Date.now() - 18 * 365 * 86400000).toISOString().slice(0, 10)}
            className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Gender (used alongside your other profile data for compatibility analysis):</p>
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
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
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
          <Button
            onClick={() => setPhase('dealbreakers')}
            disabled={
              !dob || !gender || locationMatters === null
              || (locationMatters === true && locationPostcode.length !== 5)
              || !race || !religion || languages.length === 0
            }
            className="w-full"
            size="lg"
          >
            Continue
          </Button>
        </div>
      )
    }

    if (phase === 'dealbreakers') {
      const DAYS = [
        { value: 'monday', label: 'Mon' },
        { value: 'tuesday', label: 'Tue' },
        { value: 'wednesday', label: 'Wed' },
        { value: 'thursday', label: 'Thu' },
        { value: 'friday', label: 'Fri' },
        { value: 'saturday', label: 'Sat' },
        { value: 'sunday', label: 'Sun' },
      ]
      const QUALIFICATIONS = [
        { value: 'none', label: 'No requirement' },
        { value: 'spm', label: 'SPM' },
        { value: 'diploma', label: 'Diploma' },
        { value: 'degree', label: "Bachelor's Degree" },
        { value: 'masters', label: "Master's" },
        { value: 'phd', label: 'PhD' },
      ]
      const canProceed = okayWithAfterHours !== null && hasDrivingLicense !== null && !!highestQualification
      return (
        <div className="space-y-5">
          <p className="text-sm text-ink-600 leading-relaxed">
            Set your hard limits — roles that don't meet these will <strong>never</strong> be shown to you.
          </p>

          {/* Min salary */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink-800">
              Minimum salary (RM / month)
            </label>
            <p className="text-xs text-ink-500">Leave blank if flexible.</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-medium">RM</span>
              <input
                type="number"
                min={0}
                step={500}
                value={minSalary}
                onChange={(e) => setMinSalary(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full border border-ink-200 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* No-work days */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink-800">Days I will NOT work</label>
            <p className="text-xs text-ink-500">Tap to select. Leave all unselected if flexible.</p>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map(({ value, label }) => {
                const active = noWorkDays.includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setNoWorkDays((prev) =>
                      active ? prev.filter((d) => d !== value) : [...prev, value]
                    )}
                    className={`border rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-red-500 text-white border-red-500'
                        : 'border-ink-200 text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* After-hours contact */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink-800">
              Contactable after working hours? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setOkayWithAfterHours(v)}
                  className={`border rounded-lg px-3 py-2 text-sm transition-colors ${
                    okayWithAfterHours === v
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'border-ink-200 text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {v ? 'Yes, okay with it' : 'No, strictly off-hours'}
                </button>
              ))}
            </div>
          </div>

          {/* Driving license */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink-800">
              Do you have a driving licence? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setHasDrivingLicense(v)}
                  className={`border rounded-lg px-3 py-2 text-sm transition-colors ${
                    hasDrivingLicense === v
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'border-ink-200 text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {v ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>

          {/* Qualification */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink-800">
              Highest qualification <span className="text-red-500">*</span>
            </label>
            <select
              value={highestQualification}
              onChange={(e) => setHighestQualification(e.target.value)}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">Select...</option>
              {QUALIFICATIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <Button
            onClick={() => setPhase('docs')}
            disabled={!canProceed}
            className="w-full"
            size="lg"
          >
            Continue
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
            label="IC or passport"
            accept="image/*,application/pdf"
            file={icFile}
            onChange={setIcFile}
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
          {err && <Alert tone="red">{err}</Alert>}
          <Button
            onClick={() => { setPhase('submit'); void finalise() }}
            disabled={!photoFile || !icFile || !resumeFile || busy}
            loading={busy}
            className="w-full"
            size="lg"
          >
            Finish &amp; build my profile
          </Button>
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
              <p className="text-base font-medium text-ink-800">Building your profile…</p>
              <p className="text-sm text-ink-500 leading-relaxed max-w-xs mx-auto">
                Our AI is analysing your conversation and putting together your profile. <strong>This takes about 3–5 minutes</strong> — feel free to grab a coffee and come back.
              </p>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 max-w-xs mx-auto">
                ⚠️ Please <strong>do not close or refresh</strong> this tab. Your profile will be ready shortly.
              </div>
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
    phase === 'chat'         ? 'Chat with Bole' :
    phase === 'dob'          ? 'About you' :
    phase === 'dealbreakers' ? 'Your non-negotiables' :
    phase === 'docs'         ? 'Your documents' :
    phase === 'submit' || phase === 'done' ? 'Finishing up…' : ''

  const progressPct =
    phase === 'resume'       ? 10 :
    phase === 'basics'       ? 5 :
    phase === 'chat'         ? 30 :
    phase === 'dob'          ? 65 :
    phase === 'dealbreakers' ? 80 :
    phase === 'docs'         ? 90 :
    phase === 'submit'       ? 97 : 100

  const DiamondPointsInfo = phase === 'basics' ? (
    <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <span className="font-semibold">You get 3 free matches.</span>{' '}
      Earn Diamond Points by giving feedback, completing interviews, and referring friends — or buy more.
      {' '}<span className="font-semibold">21 pts = 1 extra match.</span>
    </div>
  ) : null

  return (
    <>
      {DiamondPointsInfo}
      <ChatShell messages={log} input={composer} headline={headline} progressPct={progressPct} formMode={phase !== 'chat'} />
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
  return (
    <label className="block border border-dashed border-ink-300 rounded-lg p-3 hover:border-ink-400 transition cursor-pointer bg-white">
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
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
    </label>
  )
}
