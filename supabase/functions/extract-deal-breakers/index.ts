/**
 * extract-deal-breakers
 *
 * Reads a list of free-text non-compromise statements entered by a talent or
 * hiring manager ("what are your non-negotiables for a job?") and classifies
 * them into structured boolean flags used as hard filters in match-generate.
 *
 * Auth: talent, hiring_manager, or admin.
 * Input:  { items: string[], party: 'talent' | 'hm' }
 * Output: { deal_breakers: Record<string, boolean> }
 *
 * Talent flags:  no_travel, no_night_shifts, no_own_car, remote_only,
 *                no_relocation, no_overtime, no_commission_only
 * HM / role flags: requires_travel, has_night_shifts, requires_own_car,
 *                  requires_relocation, requires_overtime, is_commission_based
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'

interface Body { items?: string[]; party?: 'talent' | 'hm' }

const buildPrompt = (items: string[], party: 'talent' | 'hm') => {
  const isTalent = party === 'talent'
  const context = isTalent
    ? 'A job seeker listed these as their non-negotiable deal-breakers — conditions they will NOT accept in any job'
    : 'A hiring manager listed these as hard requirements for their open role'

  const schema = isTalent
    ? `{
  "no_travel": false,
  "no_night_shifts": false,
  "no_own_car": false,
  "remote_only": false,
  "no_relocation": false,
  "no_overtime": false,
  "no_commission_only": false
}`
    : `{
  "requires_travel": false,
  "has_night_shifts": false,
  "requires_own_car": false,
  "requires_relocation": false,
  "requires_overtime": false,
  "is_commission_based": false
}`

  const examples = isTalent
    ? `- "I don't travel" / "No travelling" → no_travel: true
- "No night shifts" / "Can't work nights" / "Day time only" → no_night_shifts: true
- "No own car" / "I don't drive" / "No transport" → no_own_car: true
- "Remote only" / "Work from home only" / "No office" → remote_only: true
- "Can't relocate" / "Must stay in KL" / "No moving" → no_relocation: true
- "No overtime" / "Strict 9-5" / "No after hours" → no_overtime: true
- "No commission" / "Base salary only" / "No variable pay" → no_commission_only: true`
    : `- "Travel required" / "Must visit clients" → requires_travel: true
- "Night shift" / "Shift work" / "24-hour operation" → has_night_shifts: true
- "Must have own car" / "Transport required" → requires_own_car: true
- "Must be willing to relocate" → requires_relocation: true
- "Overtime expected" / "Long hours" → requires_overtime: true
- "Commission-based" / "OTE structure" → is_commission_based: true`

  return `${context}:

${items.map((item, i) => `${i + 1}. "${item}"`).join('\n')}

Return ONLY valid JSON — no markdown fences, no explanation.

${schema}

Rules:
- Set true ONLY when the statement clearly expresses that constraint.
${examples}
- When ambiguous or unrelated, return false.
- ALL fields must be present in the output.`.trim()
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['talent', 'hiring_manager', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = await req.json() } catch { /* empty */ }

  const items = (body.items ?? []).filter((i) => typeof i === 'string' && i.trim().length > 0)
  const party = body.party ?? 'talent'

  if (items.length === 0) {
    return new Response(JSON.stringify({ deal_breakers: {} }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const result = await callExtractionAI(buildPrompt(items, party))
  if (result instanceof Response) return result

  return new Response(JSON.stringify({ deal_breakers: result }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

async function callExtractionAI(prompt: string): Promise<Record<string, unknown> | Response> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const groqKey = Deno.env.get('GROQ_API_KEY')

  if (anthropicKey) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 20_000)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 256, messages: [{ role: 'user', content: prompt }] }),
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
    const t = setTimeout(() => ac.abort(), 15_000)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 256, messages: [{ role: 'user', content: prompt }] }),
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

function parseJSON(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(cleaned) } catch { return {} }
}
