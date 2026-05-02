/**
 * chat-support
 *
 * Streams a Claude/Groq-powered "AI Support Officer" conversation.
 * Handles general enquiries, bug reports, feature requests, and payment issues.
 *
 * The client may pass `paymentContext` (a short summary of the user's recent
 * transactions) which is injected privately into the system prompt — it is
 * never sent to external AI as identifiable data, only as anonymous amounts/dates.
 *
 * Auth: any authenticated user (talent, hiring_manager, hr_admin, admin).
 * Env:  ANTHROPIC_API_KEY  — Anthropic Claude (primary)
 *       GROQ_API_KEY       — Groq fallback
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate } from '../_shared/auth.ts'

// ── System prompt ─────────────────────────────────────────────────────────────

const BASE_PROMPT = `
You are the AI Support Officer for DNJ — a smart AI-powered recruitment platform in Malaysia.
Your name is "AI Support Officer". Never refer to yourself as Bo or any other name.

Your job is to help users resolve issues, answer questions, and ensure they have a great experience on the platform. You handle four types of requests:

1. GENERAL ENQUIRY — Questions about how the platform works, features, account settings, matching, points, referrals, and anything else about DNJ.

2. BUG REPORT — Something is broken, not working as expected, or behaving strangely. Collect enough detail to reproduce the issue: what they were doing, what they expected, what actually happened, and which device/browser they are using.

3. FEATURE REQUEST — A suggestion or wish for something the platform does not currently offer. Capture the use case and why it matters to them.

4. PAYMENT ISSUE — A problem after they made a payment. This is high priority. See the payment handling section below.

━━━ PAYMENT HANDLING ━━━

Payment issues are your highest priority. When a user reports a payment problem:
• Acknowledge it immediately and empathetically: "I understand — let's sort this out right away."
• Ask them to confirm: the amount paid, the date of payment, and the payment method (card, online banking, e-wallet).
• Do NOT ask for card numbers, full bank account numbers, IC, or any sensitive personal data.
• Common payment issues and how to handle each:
  - "I paid but my account is not activated" → Reassure them it usually resolves within 15 minutes; if not, a ticket will be raised for the finance team to verify.
  - "I was charged but got an error" → Collect the error message if they remember it; tell them you will raise a ticket immediately.
  - "I want a refund" → Acknowledge the request, collect the reason, and tell them the finance team will review within 2 business days.
  - "I was charged the wrong amount" → Ask them to confirm what they expected to pay vs what was charged; raise a ticket.
  - "I need a receipt or invoice" → Tell them it will be sent to their registered email; if not received, you will raise a ticket.
• Never promise a specific refund amount or outcome — only confirm that the team will review.
• Always close payment issues by confirming a ticket is being created.

━━━ HOW TO BEHAVE ━━━

• Keep replies short — 2 to 4 sentences. This is a live support chat.
• Ask only ONE clarifying question at a time if you need more information.
• Be warm, professional, and reassuring. Never dismissive.
• If you cannot resolve the issue yourself, tell the user you will create a support ticket and the team will follow up.
• Do not use bullet points or headers in your replies. Write in natural, friendly sentences.
• Malaysian context is fine — RM for currency, BM words are acceptable if the user uses them.

━━━ TICKET CREATION ━━━

When you have gathered enough information to create a ticket (or when the user asks to submit one):
• Summarise the issue back to the user in one sentence.
• Tell them: "I've created a support ticket for you. Our team will follow up within 1 business day."
• End your message with the exact token: [TICKET_READY:{"category":"<category>","summary":"<one sentence summary>"}]
  Where category is one of: enquiry, bug, payment, feature

Rules for [TICKET_READY]:
• Only emit it once, at the very end of the message where you confirm the ticket.
• The JSON must be valid and on one line — no newlines inside it.
• For payment issues, always emit [TICKET_READY] with category "payment".
• For simple questions you fully resolve without needing follow-up, you do NOT need to emit [TICKET_READY] — just answer the question.
• [TICKET_READY] must appear at the very end of your message — nothing after it.
`.trim()

// ── Handler ───────────────────────────────────────────────────────────────────

interface Message { role: 'user' | 'assistant'; content: string }
interface Body {
  messages?: Message[]
  paymentContext?: string
}

serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const auth = await authenticate(req, {
    requiredRoles: ['talent', 'hiring_manager', 'hr_admin', 'admin'],
  })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = await req.json() } catch { /* tolerate empty */ }

  const messages: Message[] = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Inject payment context privately if provided by the client.
  let systemPrompt = BASE_PROMPT
  if (body.paymentContext && typeof body.paymentContext === 'string' && body.paymentContext.length < 1000) {
    systemPrompt += `

━━━ USER PAYMENT CONTEXT (private — use to answer payment questions, never repeat verbatim) ━━━

${body.paymentContext}`
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const groqKey = Deno.env.get('GROQ_API_KEY')

  if (anthropicKey) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 28_000)
    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          stream: true,
          system: systemPrompt,
          messages,
        }),
        signal: ac.signal,
      })
      clearTimeout(t)
      if (upstream.ok) {
        return new Response(upstream.body, {
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
        })
      }
      console.error('Anthropic error:', upstream.status)
    } catch (e) {
      clearTimeout(t)
      console.error('Anthropic fetch failed/timed out:', e)
    }
  }

  if (groqKey) {
    const groqMessages = [{ role: 'system', content: systemPrompt }, ...messages]
    const ac2 = new AbortController()
    const t2 = setTimeout(() => ac2.abort(), 28_000)
    let upstream: Response
    try {
      upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 512,
          stream: true,
          messages: groqMessages,
        }),
        signal: ac2.signal,
      })
      clearTimeout(t2)
    } catch (e) {
      clearTimeout(t2)
      console.error('Groq fetch failed/timed out:', e)
      return new Response(JSON.stringify({ error: 'AI provider timed out. Please try again.' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (upstream.ok) {
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()

      ;(async () => {
        const reader = upstream.body!.getReader()
        let buffer = ''
        let finished = false
        try {
          while (!finished) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const raw = line.slice(6).trim()
              if (raw === '[DONE]') {
                await writer.write(encoder.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'))
                finished = true
                break
              }
              try {
                const evt = JSON.parse(raw)
                const text = evt.choices?.[0]?.delta?.content
                if (typeof text === 'string' && text.length > 0) {
                  const out = JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
                  await writer.write(encoder.encode(`event: content_block_delta\ndata: ${out}\n\n`))
                }
              } catch { /* skip bad lines */ }
            }
          }
        } finally {
          await writer.close().catch(() => {})
        }
      })()

      return new Response(readable, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
      })
    }
    console.error('Groq error:', upstream.status)
  }

  return new Response(JSON.stringify({ error: 'No AI provider configured. Set ANTHROPIC_API_KEY or GROQ_API_KEY.' }), {
    status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
