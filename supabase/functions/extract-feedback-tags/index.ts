/**
 * extract-feedback-tags
 *
 * Reads a short feedback comment (HM about a talent, or talent about an HM)
 * and extracts behavioural signal tags the same way extract-talent-profile does
 * for interview transcripts — but at comment scale.
 *
 * Auth: talent or hiring_manager (or admin).
 * Input:  { free_text: string, stage: string, from_party: 'hm'|'talent' }
 * Output: { feedback_tags: Record<string,number>, theme: string }
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate } from '../_shared/auth.ts'

interface Body { free_text?: string; stage?: string; from_party?: string }

const buildPrompt = (text: string, fromParty: string, stage: string) => `
You are extracting behavioural signals from a short hiring feedback comment.

Context: A ${fromParty === 'hm' ? 'hiring manager reviewing a candidate' : 'candidate reviewing a hiring manager/company'} submitted this ${stage} feedback:

"${text}"

Return ONLY valid JSON — no markdown fences, no explanation.

{
  "feedback_tags": {
    "ownership": 0.0,
    "communication_clarity": 0.0,
    "emotional_maturity": 0.0,
    "problem_solving": 0.0,
    "resilience": 0.0,
    "results_orientation": 0.0,
    "professional_attitude": 0.0,
    "confidence": 0.0,
    "coachability": 0.0
  },
  "theme": "one sentence summarising the strongest signal in this feedback"
}

Rules:
- Score 0.0–1.0. 0 = no evidence, 1 = strong explicit evidence.
- If the comment is too short or generic ("good", "ok"), return all 0.0 and theme = "Insufficient detail".
- For HM-about-candidate: score based on how the candidate behaved.
- For candidate-about-HM: interpret tags as signals of the HM's working style and professionalism.
- theme: max 15 words, recruiter-facing, factual, no personal identifiers.
`.trim()

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const auth = await authenticate(req, { requiredRoles: ['talent', 'hiring_manager', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = await req.json() } catch { /* empty */ }

  const text = (body.free_text ?? '').trim()
  if (!text || text.length < 10) {
    return new Response(JSON.stringify({
      feedback_tags: {},
      theme: 'Insufficient detail',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const result = await callExtractionAI(buildPrompt(text, body.from_party ?? 'hm', body.stage ?? 'interview'))
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
    const t = setTimeout(() => ac.abort(), 30_000)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
        signal: ac.signal,
      })
      clearTimeout(t)
      if (res.ok) {
        const data = await res.json() as { content: { type: string; text: string }[] }
        return parseJSON(data.content?.[0]?.text ?? '')
      }
    } catch { /* fall through */ } finally { clearTimeout(t) }
  }

  if (groqKey) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 20_000)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
        signal: ac.signal,
      })
      clearTimeout(t)
      if (res.ok) {
        const data = await res.json() as { choices: { message: { content: string } }[] }
        return parseJSON(data.choices?.[0]?.message?.content ?? '')
      }
    } catch { /* fall through */ } finally { clearTimeout(t) }
  }

  return new Response(JSON.stringify({ error: 'No AI provider configured' }), {
    status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseJSON(raw: string): Record<string, unknown> | Response {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(cleaned) } catch {
    return { feedback_tags: {}, theme: 'Extraction failed' }
  }
}
