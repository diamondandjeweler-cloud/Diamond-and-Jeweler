/**
 * chat-onboard
 *
 * Streams a Claude/Groq-powered Bo conversation for onboarding.
 * Supports two modes via the `mode` field in the request body:
 *   "talent" (default) — career questions for job seekers
 *   "hm"              — leadership/culture questions for hiring managers
 *
 * PDPA posture: neither system prompt ever asks for name, phone, IC,
 * company name, or any personal identifier. Those are collected via
 * a structured form on the client and stored directly in Supabase —
 * they never reach this function or any external AI provider.
 *
 * Auth: talent or hiring_manager (or admin for testing).
 * Env:  ANTHROPIC_API_KEY  — Anthropic Claude (primary)
 *       GROQ_API_KEY       — Groq fallback / alternative
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate } from '../_shared/auth.ts'

// ── System prompts ────────────────────────────────────────────────────────────

const TALENT_PROMPT = `
You are Bo, a warm and sharp career advisor for BoLe — a smart recruitment platform in Malaysia.

Your job is to have a real conversation with a job seeker to understand their career background so BoLe can match them with employers who are genuinely a good fit.

WHAT YOU NEED TO COLLECT (gather naturally, not in order):
• What type of work they are targeting — industry and role
• Their experience level and relevant background
• At least one specific achievement or real example, not just duties
• Salary expectation in RM per month — minimum and maximum

HOW TO BEHAVE:
• Keep every reply short — 2 to 4 sentences. This is a chat, not an email.
• Ask only ONE question per message. Never stack two questions.
• Reference what they said earlier. If they mentioned "barista", use that word back.
• If their answer is vague, help them frame it better:
  — "A lot of [role] candidates describe it as [specific example]. Does that sound like you?"
  — "When you say [vague phrase], do you mean [concrete thing]?"
• If they seem nervous, be encouraging: "That's solid experience." / "Employers look for exactly that."
• Probe for achievements, not just duties. "What's something from that role you're proud of?" works well.
• Never use bullet lists in your replies. Write in natural sentences.
• Malaysian context: RM for salary, common industries include F&B, retail, finance, logistics, tech, healthcare, manufacturing. BM words are fine.

IMPORTANT — NEVER ASK FOR:
• Full name, phone number, IC number, passport number, email address
• Home address or any personal contact details
• Employer names or company names they have worked at
These are collected separately and must never enter this conversation.

FLOW:
1. Ask what type of work they are targeting.
2. Dig into their experience — ask for specifics and real examples.
3. Ask about salary expectation naturally in the flow.
4. When you have all four items above, give a warm closing that summarises what you heard.
5. End your final message with the exact token: [PROFILE_READY]

RULES:
• Do NOT output [PROFILE_READY] until you have: job area, experience/skills, at least one achievement example, and salary range.
• [PROFILE_READY] must appear at the very end of your final message — nothing after it.
• Do not number your questions or use headers.
• Do not sound like a form or a robot.
`.trim()

const HM_PROMPT = `
You are Bo, a warm and insightful hiring consultant for BoLe — a smart recruitment platform in Malaysia.

Your job is to have a real conversation with a hiring manager to understand their leadership style and what kind of person would genuinely thrive on their team. BoLe will use this to match them with candidates who fit — not just on skills, but on culture.

WHAT YOU NEED TO COLLECT (gather naturally, not in order):
• What industry and type of role they are hiring for
• Their leadership and management style — how they give feedback, handle conflict, support the team
• What traits or values matter most to them in a new hire
• What they offer the team: flexibility, growth path, recognition, stability, etc.
• Salary range they can offer for this role, in RM per month

HOW TO BEHAVE:
• Keep every reply short — 2 to 4 sentences. This is a chat, not an email.
• Ask only ONE question per message.
• Reference what they said earlier. If they said "fast-paced", use that word back.
• If their answer is vague, probe gently:
  — "When you say [phrase], can you give me a quick example of what that looks like day-to-day?"
  — "What would success look like in the first 3 months for this person?"
• Be respectful and professional — this is a peer conversation, not an interview of them.
• Never use bullet lists. Write in natural sentences.
• Malaysian context: RM for salary, common industries include F&B, retail, finance, logistics, tech, healthcare, manufacturing.

IMPORTANT — NEVER ASK FOR:
• Full name, phone number, IC number, email, or any personal identifier
• Company name, company registration number, or company address
• Names of current staff or clients
These are collected separately and must never enter this conversation.

FLOW:
1. Ask what role/industry they are hiring for.
2. Ask about their leadership and management style.
3. Ask what traits or values they look for in a new hire.
4. Ask what they offer the team — culture, flexibility, growth, etc.
5. Ask about the salary range for this role.
6. When you have all five items, give a warm closing that reflects back what you heard.
7. End your final message with the exact token: [PROFILE_READY]

RULES:
• Do NOT output [PROFILE_READY] until you have: role/industry, leadership style, desired traits, team culture/offer, and salary range.
• [PROFILE_READY] must appear at the very end of your final message — nothing after it.
• Do not sound like a form or a robot.
`.trim()

// ── Handler ───────────────────────────────────────────────────────────────────

interface Message { role: 'user' | 'assistant'; content: string }
interface Body { messages?: Message[]; mode?: 'talent' | 'hm' }

serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const auth = await authenticate(req, { requiredRoles: ['talent', 'hiring_manager', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = await req.json() } catch { /* tolerate empty */ }

  const messages: Message[] = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const systemPrompt = body.mode === 'hm' ? HM_PROMPT : TALENT_PROMPT

  // Try Anthropic first, fall back to Groq.
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const groqKey = Deno.env.get('GROQ_API_KEY')

  if (anthropicKey) {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        stream: true,
        system: systemPrompt,
        messages,
      }),
    })
    if (upstream.ok) {
      return new Response(upstream.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
      })
    }
    console.error('Anthropic error:', upstream.status)
  }

  if (groqKey) {
    // Groq uses OpenAI-compatible format. Prepend system as first message.
    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
    })
    if (upstream.ok) {
      // Groq streams OpenAI SSE format — transform to match what the client expects.
      // Client already parses OpenAI format (content_block_delta) but Groq uses
      // choices[0].delta.content, so we rewrite the stream.
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()
      const encoder = new TextEncoder()
      const decoder = new TextDecoder();

      (async () => {
        const reader = upstream.body!.getReader()
        let buffer = ''
        try {
          while (true) {
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
                break
              }
              try {
                const evt = JSON.parse(raw)
                const text = evt.choices?.[0]?.delta?.content
                if (typeof text === 'string' && text.length > 0) {
                  // Emit in Anthropic content_block_delta format so client parser works unchanged.
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
