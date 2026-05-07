/**
 * draft-role-description — generates a starter description for a role posting.
 *
 * Returns a 4–6 sentence draft that the HM/HR can edit. Helps users who don't
 * know what to write in the description field on PostRole.
 *
 * Provider chain (first available wins): Groq → Gemini → OpenAI → Anthropic.
 * Non-streaming, ~150 token output, ~1–2s latency on Groq.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'

interface Body {
  title?: string
  location?: string
  employment_type?: string
  weight_preset?: string
  industry?: string
}

const SYSTEM_PROMPT = `You write concise role-description drafts for HR managers using a Malaysia-focused recruitment platform (DNJ).

Rules:
- 4 to 6 short sentences. Plain English. No bullet points, no headings, no markdown.
- Cover: what the candidate will own day-to-day, who they work with, and 1 outcome that defines success.
- Skip generic corporate filler ("dynamic team", "fast-paced environment").
- Skip salary, benefits, application instructions — those go in other fields.
- Write in second person ("you'll...") so it reads like a pitch to the candidate.
- Output ONLY the draft text. No preamble, no quotation marks, no explanations.`

function userPrompt(b: Body): string {
  const parts: string[] = [`Job title: ${b.title}`]
  if (b.industry) parts.push(`Industry: ${b.industry}`)
  if (b.location) parts.push(`Location: ${b.location}`)
  if (b.employment_type) parts.push(`Employment type: ${b.employment_type.replace(/_/g, ' ')}`)
  if (b.weight_preset) parts.push(`Role profile: ${b.weight_preset}`)
  parts.push(`\nDraft a 4–6 sentence description for this role.`)
  return parts.join('\n')
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['hiring_manager', 'hr_admin', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* tolerate */ }
  const title = body.title?.trim()
  if (!title) return json({ error: 'Missing role title' }, 400)
  if (title.length > 200) return json({ error: 'Title too long' }, 400)

  const sys = SYSTEM_PROMPT
  const usr = userPrompt({ ...body, title })

  const groqKey = Deno.env.get('GROQ_API_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

  // Groq (fastest, cheapest)
  if (groqKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 350,
          temperature: 0.6,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) {
        const j = await r.json()
        const text = j.choices?.[0]?.message?.content?.trim()
        if (text) return json({ description: text, provider: 'groq' })
      } else {
        console.error('Groq error:', r.status)
      }
    } catch (e) { console.error('Groq fetch failed:', e) }
  }

  // Gemini
  if (geminiKey) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: 'user', parts: [{ text: usr }] }],
          generationConfig: { maxOutputTokens: 350, temperature: 0.6 },
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) {
        const j = await r.json()
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (text) return json({ description: text, provider: 'gemini' })
      } else {
        console.error('Gemini error:', r.status)
      }
    } catch (e) { console.error('Gemini fetch failed:', e) }
  }

  // OpenAI
  if (openaiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 350,
          temperature: 0.6,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) {
        const j = await r.json()
        const text = j.choices?.[0]?.message?.content?.trim()
        if (text) return json({ description: text, provider: 'openai' })
      } else {
        console.error('OpenAI error:', r.status)
      }
    } catch (e) { console.error('OpenAI fetch failed:', e) }
  }

  // Anthropic
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 350,
          system: sys,
          messages: [{ role: 'user', content: usr }],
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) {
        const j = await r.json()
        const text = j.content?.[0]?.text?.trim()
        if (text) return json({ description: text, provider: 'anthropic' })
      } else {
        console.error('Anthropic error:', r.status)
      }
    } catch (e) { console.error('Anthropic fetch failed:', e) }
  }

  return new Response(
    JSON.stringify({ error: 'No AI provider available right now. Try again or write the description yourself.' }),
    { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
