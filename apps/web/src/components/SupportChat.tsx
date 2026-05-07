import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../state/useSession'

interface ChatMessage {
  id: string
  from: 'ai' | 'user'
  content: string
  typing?: boolean
}

interface TicketMeta {
  category: 'enquiry' | 'bug' | 'feature' | 'payment'
  summary: string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

export default function SupportChat() {
  const { session, profile } = useSession()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [ticketCreated, setTicketCreated] = useState(false)
  const [openCount, setOpenCount] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Stable conversation id for the lifetime of this chat session — every
  // message in a back-and-forth shares it so analytics can group turns.
  const conversationIdRef = useRef<string>(crypto.randomUUID())

  // Scroll to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fetch user's open ticket count for badge
  useEffect(() => {
    if (!session) return
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .in('status', ['open', 'in_progress'])
      .then(({ count }) => setOpenCount(count ?? 0))
  }, [session, ticketCreated])

  // Greet on first open
  useEffect(() => {
    if (!profile) return
    if (open && messages.length === 0) {
      setMessages([{
        id: 'greeting',
        from: 'ai',
        content: `Hi${profile.full_name ? ` ${profile.full_name.split(' ')[0]}` : ''}! I'm your AI Support Officer. How can I help you today? Feel free to ask about the platform, report an issue, or let me know if there's a payment problem.`,
      }])
    }
  }, [open, profile, messages.length])

  const createTicket = useCallback(async (meta: TicketMeta, transcript: ChatMessage[]) => {
    const { error } = await supabase.from('support_tickets').insert({
      user_id: session!.user.id,
      category: meta.category,
      summary: meta.summary,
      transcript: transcript.map((m) => ({ from: m.from, content: m.content })),
      status: 'open',
    })
    if (!error) setTicketCreated(true)
  }, [session])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg: ChatMessage = { id: Date.now().toString(), from: 'user', content: text }
    const aiMsgId = (Date.now() + 1).toString()
    const typingMsg: ChatMessage = { id: aiMsgId, from: 'ai', content: '', typing: true }

    setMessages((prev) => [...prev, userMsg, typingMsg])
    setInput('')
    setStreaming(true)

    // Build conversation history (exclude greeting, convert to API format)
    const history = [...messages, userMsg]
      .filter((m) => m.id !== 'greeting' || m.from === 'ai')
      .map((m) => ({ role: m.from === 'user' ? 'user' as const : 'assistant' as const, content: m.content }))
      .filter((m) => m.content.length > 0)

    // Fetch payment context if user mentions payment-related keywords
    let paymentContext: string | undefined
    const paymentKeywords = /pay|payment|paid|charge|refund|receipt|invoice|transaction|rm\s*\d/i
    if (paymentKeywords.test(text) && !ticketCreated) {
      try {
        const { data } = await supabase
          .from('orders')
          .select('id, amount, status, created_at, payment_method')
          .eq('user_id', session!.user.id)
          .order('created_at', { ascending: false })
          .limit(5)
        if (data && data.length > 0) {
          paymentContext = `User's recent transactions (most recent first):\n` +
            data.map((o) => `- RM ${o.amount} via ${o.payment_method ?? 'unknown'}, status: ${o.status}, date: ${o.created_at?.slice(0, 10)}`).join('\n')
        }
      } catch { /* best-effort */ }
    }

    const ac = new AbortController()
    abortRef.current = ac
    const timeout = setTimeout(() => ac.abort(), 45_000)

    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-support`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s?.access_token ?? ''}`,
        },
        body: JSON.stringify({ messages: history, paymentContext, conversation_id: conversationIdRef.current }),
        signal: ac.signal,
      })

      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break
          try {
            const evt = JSON.parse(raw)
            // Anthropic SSE format
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              fullText += evt.delta.text
              setMessages((prev) => prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: fullText, typing: false } : m
              ))
            }
          } catch { /* skip */ }
        }
      }

      clearTimeout(timeout)

      // If the stream closed without sending any content, show a fallback error
      if (fullText === '') {
        setMessages((prev) => prev.map((m) =>
          m.id === aiMsgId ? { ...m, content: 'No response received. Please try again.', typing: false } : m
        ))
        return
      }

      // Parse [TICKET_READY] token
      const tokenMatch = fullText.match(/\[TICKET_READY:(\{.*?\})\]/)
      if (tokenMatch) {
        // Strip token from displayed message
        const cleanText = fullText.replace(/\s*\[TICKET_READY:\{.*?\}\]/, '')
        setMessages((prev) => prev.map((m) =>
          m.id === aiMsgId ? { ...m, content: cleanText } : m
        ))
        try {
          const meta: TicketMeta = JSON.parse(tokenMatch[1])
          await createTicket(meta, [...messages, userMsg, { id: aiMsgId, from: 'ai', content: cleanText }])
        } catch { /* best-effort */ }
      }
    } catch (e: unknown) {
      clearTimeout(timeout)
      if ((e as Error)?.name !== 'AbortError') {
        setMessages((prev) => prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: 'Sorry, something went wrong. Please try again.', typing: false }
            : m
        ))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, messages, streaming, session, ticketCreated, createTicket])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  // Don't render on public pages (no session)
  if (!session || !profile) return null

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        aria-label="Open support chat"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800 transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
        {!open && openCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {openCount > 9 ? '9+' : openCount}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-[22rem] max-w-[calc(100vw-3rem)] h-[30rem] max-h-[calc(100dvh-8rem)] flex flex-col rounded-2xl shadow-2xl border border-ink-200 bg-white overflow-hidden animate-slide-up"
          role="dialog"
          aria-label="AI Support Officer chat"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-brand-700 text-white shrink-0">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">
              AI
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm leading-tight">AI Support Officer</div>
              <div className="text-[11px] text-brand-200 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />
                Online · DNJ Support
              </div>
            </div>
            {ticketCreated && (
              <span className="text-[10px] bg-white/20 rounded px-1.5 py-0.5 font-medium">Ticket raised</span>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-2 ${m.from === 'user' ? 'justify-end' : ''}`}>
                {m.from === 'ai' && (
                  <div className="h-7 w-7 rounded-full bg-brand-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    AI
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-soft ${
                    m.from === 'user'
                      ? 'bg-ink-900 text-white rounded-br-md'
                      : 'bg-white text-ink-800 border border-ink-200 rounded-bl-md'
                  }`}
                >
                  {m.typing ? (
                    <span className="inline-flex items-center gap-1 py-0.5" aria-label="typing">
                      <span className="h-1.5 w-1.5 rounded-full bg-ink-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-ink-400 animate-bounce" style={{ animationDelay: '120ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-ink-400 animate-bounce" style={{ animationDelay: '240ms' }} />
                    </span>
                  ) : m.content}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="border-t border-ink-200 p-3 shrink-0 bg-white">
            {ticketCreated ? (
              <p className="text-xs text-ink-500 text-center py-1">
                Ticket created — our team will follow up within 1 business day.
              </p>
            ) : (
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type your message…"
                  rows={1}
                  disabled={streaming}
                  className="flex-1 resize-none rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                  style={{ maxHeight: '6rem' }}
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || streaming}
                  className="h-9 w-9 shrink-0 self-end rounded-xl bg-brand-700 text-white flex items-center justify-center hover:bg-brand-800 disabled:opacity-40 transition-colors"
                  aria-label="Send"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
