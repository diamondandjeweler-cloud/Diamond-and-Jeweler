/**
 * HMOnboarding — AI-powered chat onboarding for hiring managers.
 *
 * Phases:
 *   basics — structured form: name + job title (never sent to AI)
 *   chat   — Bo (Claude) HM-mode conversation, ends with [PROFILE_READY]
 *   dob    — structured date input (encrypted for BaZi matching)
 *   submit — extract HM profile from transcript, update hiring_managers row
 *   done   — redirect to /hm
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

type Phase = 'basics' | 'chat' | 'mustHaves' | 'dob' | 'submit' | 'done'

const QUALIFICATION_ORDER: Record<string, number> = {
  none: 0, spm: 1, diploma: 2, degree: 3, masters: 4, phd: 5,
}
interface ApiMessage { role: 'user' | 'assistant'; content: string }

const BO_GREETING =
  "Hi! I'm Bole — your hiring consultant from DNJ. I'm here to understand your team and what kind of person would genuinely thrive working with you, so we can find the right match.\n\nLet's start: what role and industry are you hiring for?"

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
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [dobConsent, setDobConsent] = useState(false)
  const [afterHoursRequired, setAfterHoursRequired] = useState<boolean | null>(null)
  const [drivingLicenseRequired, setDrivingLicenseRequired] = useState<boolean | null>(null)
  const [minQualification, setMinQualification] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const idRef = useRef(0)
  const nextId = () => `m${++idRef.current}`
  const chatInitRef = useRef(false)
  const updatedRef = useRef(false)

  // Seed Bo's greeting when entering the chat phase — no API call needed.
  useEffect(() => {
    if (phase !== 'chat' || chatInitRef.current) return
    chatInitRef.current = true
    setLog([{ id: nextId(), from: 'system', content: BO_GREETING }])
    setApiMessages([{ role: 'assistant', content: BO_GREETING }])
  }, [phase])

  if (!session || !profile) return null

  // One-time Diamond Points info banner (shown on basics phase before chat).
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
          body: JSON.stringify({ messages: newApiMsgs, mode: 'hm' }),
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
        const savedAt = new Date().toISOString()
        const transcriptPayload = { messages: finalMsgs, saved_at: savedAt }

        // Save transcript to profiles (draft) AND hiring_managers row in parallel.
        Promise.all([
          supabase.from('profiles')
            .update({ interview_transcript: transcriptPayload })
            .eq('id', session!.user.id),
          supabase.from('hiring_managers')
            .update({ interview_answers: { transcript: finalMsgs } })
            .eq('profile_id', session!.user.id),
        ]).then(() => { /* best-effort */ })

        setLog((l) => [
          ...l,
          {
            id: nextId(),
            from: 'system',
            content:
              "Almost done — a couple of quick questions about your candidate requirements, then your date of birth.",
          },
        ])
        setTimeout(() => setPhase('mustHaves'), 600)
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
    if (updatedRef.current) {
      navigate('/hm', { replace: true })
      return
    }
    setErr(null)
    setBusy(true)
    try {
      const userId = session.user.id

      const [dobEncrypted, authData] = await Promise.all([
        encryptDob(dob),
        supabase.auth.getSession(),
      ])
      const token = authData.data.session?.access_token
      if (!token) throw new Error('Not authenticated')

      // Record DOB consent on profile.
      if (dobConsent) {
        const nextConsents = {
          ...(profile?.consents as Record<string, unknown>),
          dob: true,
          dob_consented_at: new Date().toISOString(),
        }
        const { error: consentErr } = await supabase
          .from('profiles').update({ consents: nextConsents }).eq('id', userId)
        if (consentErr) throw consentErr
      }

      // Extract structured HM profile from transcript.
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
        leadership_tags: Record<string, number>
        required_traits: string[]
        culture_offers: Record<string, number>
        salary_offer_min: number | null
        salary_offer_max: number | null
        summary: string | null
      }

      // Find the HM row (created by invite-hm Edge Function) and update it.
      const { data: hmRow, error: hmErr } = await supabase
        .from('hiring_managers')
        .select('id')
        .eq('profile_id', userId)
        .maybeSingle()
      if (hmErr) throw hmErr
      if (!hmRow) {
        throw new Error(
          'No hiring-manager record found for your account. Ask your HR contact to re-send the invite.',
        )
      }

      const lifeChartCharacter = gender
        ? getLifeChartCharacter(dob, gender)
        : null

      const { error: updateErr } = await supabase
        .from('hiring_managers')
        .update({
          date_of_birth_encrypted: dobEncrypted,
          gender: gender || null,
          life_chart_character: lifeChartCharacter,
          job_title: jobTitle.trim(),
          industry: extracted.industry,
          role_type: extracted.role_type,
          leadership_tags: extracted.leadership_tags,
          required_traits: extracted.required_traits,
          culture_offers: extracted.culture_offers,
          salary_offer_min: extracted.salary_offer_min,
          salary_offer_max: extracted.salary_offer_max,
          ai_summary: extracted.summary,
          interview_answers: { transcript: apiMessages },
          must_haves: {
            after_hours_contact: afterHoursRequired,
            driving_license: drivingLicenseRequired,
            min_qualification: minQualification || null,
          },
        })
        .eq('id', hmRow.id)
      if (updateErr) throw updateErr
      updatedRef.current = true

      // Update profile with full name collected locally — never sent to AI.
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', userId)
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

  // ── composer per phase ───────────────────────────────────────────────────

  const composer = (() => {
    if (phase === 'basics') {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (fullName.trim() && jobTitle.trim()) setPhase('chat')
          }}
          className="space-y-3"
        >
          <p className="text-sm text-ink-600">
            Before we start — just your name and job title. These stay on our servers and are never shared with AI systems.
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
            <label className="block text-sm font-medium text-ink-700 mb-1">Job title</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Operations Manager, Hiring Manager"
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <Button
            type="submit"
            disabled={!fullName.trim() || !jobTitle.trim()}
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

    if (phase === 'mustHaves') {
      const QUALIFICATIONS = [
        { value: 'none', label: 'No requirement / Any' },
        { value: 'spm', label: 'SPM' },
        { value: 'diploma', label: 'Diploma' },
        { value: 'degree', label: "Bachelor's Degree" },
        { value: 'masters', label: "Master's" },
        { value: 'phd', label: 'PhD' },
      ]
      const canProceed = afterHoursRequired !== null && drivingLicenseRequired !== null && !!minQualification
      return (
        <div className="space-y-5">
          <p className="text-sm text-ink-600 leading-relaxed">
            Set your <strong>non-negotiables</strong>. Candidates who don't meet these will never appear in your matches.
          </p>

          {/* After-hours contact */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink-800">
              Must be contactable after working hours? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setAfterHoursRequired(v)}
                  className={`border rounded-lg px-3 py-2 text-sm transition-colors ${
                    afterHoursRequired === v
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'border-ink-200 text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {v ? 'Yes, required' : 'No, not required'}
                </button>
              ))}
            </div>
          </div>

          {/* Driving license */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink-800">
              Must have a valid driving licence? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setDrivingLicenseRequired(v)}
                  className={`border rounded-lg px-3 py-2 text-sm transition-colors ${
                    drivingLicenseRequired === v
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'border-ink-200 text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {v ? 'Yes, required' : 'No, not required'}
                </button>
              ))}
            </div>
          </div>

          {/* Min qualification */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink-800">
              Minimum qualification required <span className="text-red-500">*</span>
            </label>
            <select
              value={minQualification}
              onChange={(e) => setMinQualification(e.target.value)}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">Select...</option>
              {QUALIFICATIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <Button
            onClick={() => setPhase('dob')}
            disabled={!canProceed}
            className="w-full"
            size="lg"
          >
            Continue
          </Button>
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
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            max={new Date(Date.now() - 18 * 365 * 86400000).toISOString().slice(0, 10)}
            className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="space-y-1">
            <p className="text-sm text-ink-600">Gender (used by the matching engine alongside DOB):</p>
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
          <Consent
            checked={dobConsent}
            onChange={setDobConsent}
            label="I consent to DNJ collecting my date of birth for advanced AI-powered compatibility analysis. It will be encrypted and never disclosed to candidates."
            required
          />
          {err && <Alert tone="red">{err}</Alert>}
          <Button
            onClick={() => { setPhase('submit'); void finalise() }}
            disabled={!dob || !gender || !dobConsent || busy}
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
        <div className="space-y-2 text-center">
          {err ? (
            <>
              <Alert tone="red">{err}</Alert>
              <Button onClick={() => { setPhase('dob') }} className="w-full">
                Back
              </Button>
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
    phase === 'basics'    ? 'About you' :
    phase === 'chat'      ? 'Chat with Bole' :
    phase === 'mustHaves' ? 'Your non-negotiables' :
    phase === 'dob'       ? 'Date of birth' :
    phase === 'submit'    ? 'Finishing up…' : ''

  const progressPct =
    phase === 'basics'    ? 5 :
    phase === 'chat'      ? 40 :
    phase === 'mustHaves' ? 75 :
    phase === 'dob'       ? 88 :
    phase === 'submit'    ? 97 : 100

  return (
    <>
      {DiamondPointsInfo}
      <ChatShell messages={log} input={composer} headline={headline} progressPct={progressPct} formMode={phase !== 'chat'} />
    </>
  )
}
