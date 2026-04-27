import { ReactNode, useEffect, useRef } from 'react'

/**
 * ChatShell renders a chat-style interview surface: scrollable message list
 * with bubbles, auto-scroll on new content, and an input area at the bottom.
 * No LLM. All turns are scripted in the parent; ChatShell just paints them.
 */

export interface ChatMessage {
  id: string
  from: 'system' | 'you'
  content: ReactNode
  /** Render a typing indicator instead of content. */
  typing?: boolean
}

export default function ChatShell({
  messages,
  input,
  headline,
  progressPct,
}: {
  messages: ChatMessage[]
  /** The bottom composer area (input + send button, or custom control). */
  input: ReactNode
  /** Top progress hint, e.g. "Question 3 of 20". */
  headline?: ReactNode
  /** 0–100 progress bar under the headline. */
  progressPct?: number
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-10rem)]">
      {(headline || progressPct !== undefined) && (
        <div className="mb-4">
          {headline && <div className="text-xs text-ink-500 uppercase tracking-wider font-medium mb-2">{headline}</div>}
          {progressPct !== undefined && (
            <div className="h-1 bg-ink-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-600 transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-3">
        {messages.map((m) => (
          <Bubble key={m.id} from={m.from} typing={m.typing}>{m.content}</Bubble>
        ))}
        <div ref={endRef} />
      </div>

      <div className="bg-white border-t border-ink-200 pt-4 mt-2">
        {input}
      </div>
    </div>
  )
}

function Bubble({
  from, typing, children,
}: {
  from: 'system' | 'you'
  typing?: boolean
  children: ReactNode
}) {
  const isYou = from === 'you'
  return (
    <div className={`flex gap-2.5 ${isYou ? 'justify-end' : ''} animate-slide-up`}>
      {!isYou && <SystemAvatar />}
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-soft ${
          isYou
            ? 'bg-ink-900 text-white rounded-br-md'
            : 'bg-white text-ink-800 border border-ink-200 rounded-bl-md'
        }`}
      >
        {typing ? <TypingDots /> : children}
      </div>
      {isYou && <YouAvatar />}
    </div>
  )
}

function SystemAvatar() {
  return (
    <div className="h-8 w-8 shrink-0 rounded-full bg-brand-700 text-white flex items-center justify-center text-xs font-display">
      Bo
    </div>
  )
}

function YouAvatar() {
  return (
    <div className="h-8 w-8 shrink-0 rounded-full bg-accent-500/15 border border-accent-500/40 text-accent-600 flex items-center justify-center text-xs font-semibold">
      You
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="typing">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="h-1.5 w-1.5 rounded-full bg-ink-400 animate-bounce" style={{ animationDelay: '120ms' }} />
      <span className="h-1.5 w-1.5 rounded-full bg-ink-400 animate-bounce" style={{ animationDelay: '240ms' }} />
    </span>
  )
}
