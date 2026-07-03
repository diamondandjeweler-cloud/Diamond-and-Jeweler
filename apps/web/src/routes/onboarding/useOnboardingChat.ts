/**
 * useOnboardingChat — the shared Bo chat-streaming engine (Phase 3-5 clean-arch).
 *
 * The Talent and HM onboarding wizards ran byte-for-byte identical SSE streaming
 * loops: same 10s "AI is slow" soft warning, same 25s stall abort, same
 * AbortController plumbing, same progressive repaint, same `[PROFILE_READY]`
 * completion handshake, same partial-transcript recovery on abort. Only a
 * handful of edges differed — the request body, the i18n copy, and the
 * persistence/draft side-effects fired when the turn finishes. Those differences
 * are injected through `OnboardingChatConfig`; everything mechanical lives here.
 *
 * The pure SSE parsing (frame decoding, sentinel detection, partial-sentinel
 * hiding) is delegated to `shared/domain/onboarding/chatStream`, which carries
 * its own golden-vector characterization suite. This hook owns only the
 * imperative shell: fetch, timers, abort, and React state.
 *
 * Data-access note: the streaming reply must arrive as a live `ReadableStream`,
 * which `supabase.functions.invoke` (used by `callFunction`) buffers — so the
 * hook keeps the original raw `fetch` against the edge function. It reads the
 * access token through `supabase.auth.getSession()` exactly as the two route
 * components did before; it does not touch the §6 auth-refresh lock.
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction, type RefObject } from 'react'
import { supabase } from '../../lib/supabase'
import type { ChatMessage } from '../../components/ChatShell'
import { splitSseBuffer, accumulateSseLines, isProfileReady, displayText } from '../../shared/domain/onboarding/chatStream'

export interface ApiMessage { role: 'user' | 'assistant'; content: string }

export interface OnboardingChatConfig {
  /** Copy shown after 10s if no chunk has streamed yet. */
  slowWarning: string
  /** Copy that replaces the in-flight bubble when the stream errors out. */
  chatError: string
  /** Copy appended after progress is recovered following a mid-stream abort. */
  progressSaved: string
  /**
   * Extra request-body fields for this wizard (e.g. `{ dob, gender }` for talent,
   * `{ mode: 'hm' }` for HM). `messages` and `conversation_id` are always added.
   */
  buildRequestBody: (newApiMsgs: ApiMessage[]) => Record<string, unknown>
  /** Persist the local draft snapshot once the sentinel arrives (or wipe it). */
  onDraftComplete: (finalMsgs: ApiMessage[]) => void
  /** Persist a mid-chat / partial local draft snapshot for crash recovery. */
  onDraftPartial: (msgs: ApiMessage[]) => void
  /** Persist the transcript to Supabase; `partial` marks an aborted turn. */
  persistTranscript: (msgs: ApiMessage[], opts: { partial: boolean }) => void
  /**
   * Fired once, when `[PROFILE_READY]` is seen on a completed turn — the wizard
   * appends its own "almost done" message and schedules the next phase here.
   */
  onProfileReady: () => void
}

export interface OnboardingChatState {
  input: string
  setInput: Dispatch<SetStateAction<string>>
  isStreaming: boolean
  /** Send `text` as the next user turn (no-op unless on the chat phase & idle). */
  sendMessage: (text: string) => Promise<void>
  /** Abort the in-flight stream (the "Stop" button). */
  stop: () => void
}

/**
 * Wire up the streaming chat turn. The caller owns the shared message state
 * (`log`/`apiMessages`) so it can also seed the greeting and restore drafts;
 * this hook drives the network turn and mutates that state through the setters.
 */
export function useOnboardingChat(params: {
  phase: string
  log: ChatMessage[]
  setLog: Dispatch<SetStateAction<ChatMessage[]>>
  apiMessages: ApiMessage[]
  setApiMessages: Dispatch<SetStateAction<ApiMessage[]>>
  nextId: () => string
  conversationIdRef: RefObject<string>
  config: OnboardingChatConfig
}): OnboardingChatState {
  const { phase, setLog, apiMessages, setApiMessages, nextId, conversationIdRef, config } = params

  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortCtrlRef = useRef<AbortController | null>(null)

  // Abort any in-flight SSE stream when the component unmounts. (The parent
  // separately clears its own phase timer on unmount.)
  useEffect(() => () => { abortCtrlRef.current?.abort() }, [])

  const stop = () => abortCtrlRef.current?.abort()

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
        setLog((l) => [...l, { id: warnMsgId, from: 'system', content: config.slowWarning }])
      }, 10_000)

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-onboard`,
        {
          method: 'POST',
          signal: abortCtrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...config.buildRequestBody(newApiMsgs),
            messages: newApiMsgs,
            conversation_id: conversationIdRef.current,
          }),
        },
      )
      if (!res.ok) throw new Error(`Server error ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        clearWarn()
        resetStall()
        buffer += decoder.decode(value, { stream: true })
        const { lines, rest } = splitSseBuffer(buffer)
        buffer = rest

        const step = accumulateSseLines(lines, accumulated)
        if (step.accumulated !== accumulated) {
          accumulated = step.accumulated
          const display = displayText(accumulated)
          setLog((l) => l.map((m) => (m.id === boId ? { ...m, content: display, typing: false } : m)))
        }
        if (step.stop) break
      }
      clearTimeout(stallTimer)

      const finalMsgs: ApiMessage[] = [...newApiMsgs, { role: 'assistant', content: accumulated }]
      setApiMessages(finalMsgs)

      if (isProfileReady(accumulated)) {
        config.onDraftComplete(finalMsgs)
        config.persistTranscript(finalMsgs, { partial: false })
        config.onProfileReady()
      } else {
        config.onDraftPartial(finalMsgs)
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (isAbort && accumulated.trim()) {
        const partialMsgs: ApiMessage[] = [...newApiMsgs, { role: 'assistant', content: accumulated }]
        setApiMessages(partialMsgs)
        config.onDraftPartial(partialMsgs)
        config.persistTranscript(partialMsgs, { partial: true })
        setLog((l) => [
          ...l.map((m) => (m.id === boId ? { ...m, typing: false } : m)),
          { id: nextId(), from: 'system', content: config.progressSaved },
        ])
      } else if (isAbort) {
        setLog((l) => l.map((m) => (m.id === boId ? { ...m, content: '', typing: false } : m)))
      } else {
        setLog((l) => l.map((m) => (m.id === boId ? { ...m, content: config.chatError, typing: false } : m)))
      }
    } finally {
      clearWarn()
      setIsStreaming(false)
    }
  }

  return { input, setInput, isStreaming, sendMessage, stop }
}
