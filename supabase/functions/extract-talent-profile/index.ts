/**
 * extract-talent-profile
 *
 * Converts a Bo conversation transcript into structured career data.
 *
 * PDPA posture: the transcript must contain NO personal identifiers —
 * name, phone, IC, employer names are collected via a separate form
 * and never enter the conversation sent to this function. This function
 * only extracts career-relevant data: job areas, skills, salary, tags.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate } from '../_shared/auth.ts'

interface Message { role: 'user' | 'assistant'; content: string }
interface Body { messages?: Message[] }

const buildPrompt = (transcript: string) => `
You are a precise data extractor for a recruitment platform. Read the career interview transcript below and extract structured career profile data.

Return ONLY valid JSON — no markdown fences, no explanation, no extra text whatsoever.

The transcript contains NO personal identifiers (no names, no phone numbers, no IC numbers) — do not try to infer or add any.

Transcript:
${transcript}

Return this exact JSON structure (use null for any value not mentioned):
{
  "job_areas": string[],
  "years_experience": number | null,
  "key_skills": string[],
  "career_goals": string | null,
  "salary_min": number | null,
  "salary_max": number | null,
  "derived_tags": {
    "self_starter": number,
    "collaborator": number,
    "growth_minded": number,
    "reliable": number,
    "customer_focused": number,
    "detail_oriented": number,
    "analytical": number,
    "accountable": number,
    "clear_communicator": number,
    "adaptable": number,
    "leadership": number
  },
  "wants_wlb": number,
  "wants_fair_pay": number,
  "wants_growth": number,
  "wants_stability": number,
  "wants_flexibility": number,
  "wants_recognition": number,
  "wants_mission": number,
  "wants_team_culture": number,
  "summary": string | null
}

Rules:
- job_areas: include specific role AND industry, e.g. ["barista", "F&B", "cafe management"]
- key_skills: concrete skills mentioned, not generic traits
- salary_min / salary_max: numbers only, RM per month. If single number given, use for both.
- derived_tags: score 0.0–1.0 based on evidence. 0.0 = no evidence, 1.0 = strong explicit evidence.
- wants_* tags: infer from what candidate said they value. 0.0–1.0. wants_team_culture reflects how much they value camaraderie, close teamwork, and a collaborative environment.
- summary: 2-sentence recruiter-facing summary of career background and strengths only — no personal details.
- DO NOT include name, phone, email, company names, or any personal identifiers in the output.
`.trim()

serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const auth = await authenticate(req, { requiredRoles: ['talent', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = await req.json() } catch { /* empty */ }

  const messages: Message[] = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const transcript = messages
    .map((m) => `${m.role === 'assistant' ? 'Bo' : 'Candidate'}: ${m.content}`)
    .join('\n\n')

  const result = await callExtractionAI(buildPrompt(transcript))
  if (result instanceof Response) return result

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

async function callExtractionAI(prompt: string): Promise<Record<string, unknown> | Response> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const groqKey = Deno.env.get('GROQ_API_KEY')

  if (anthropicKey) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 90_000)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
        signal: ac.signal,
      })
      if (res.ok) {
        const data = await res.json() as { content: { type: string; text: string }[] }
        return parseJSON(data.content?.[0]?.text ?? '')
      }
    } catch { /* fall through to Groq */ } finally { clearTimeout(t) }
  }

  if (groqKey) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 60_000)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
        signal: ac.signal,
      })
      if (res.ok) {
        const data = await res.json() as { choices: { message: { content: string } }[] }
        return parseJSON(data.choices?.[0]?.message?.content ?? '')
      }
    } catch { /* fall through to error */ } finally { clearTimeout(t) }
  }

  return new Response(JSON.stringify({ error: 'No AI provider configured.' }), {
    status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseJSON(raw: string): Record<string, unknown> | Response {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    console.error('JSON parse failed:', cleaned)
    return new Response(JSON.stringify({ error: 'Extraction returned invalid JSON', raw: cleaned }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}
