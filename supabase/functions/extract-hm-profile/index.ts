/**
 * extract-hm-profile
 *
 * Converts a Bo conversation with a hiring manager into structured
 * leadership and culture data ready for the hiring_managers table.
 *
 * PDPA posture: the transcript must contain NO personal identifiers —
 * name, phone, company name are collected via a separate form. This
 * function only extracts leadership style, culture, and role requirements.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate } from '../_shared/auth.ts'

interface Message { role: 'user' | 'assistant'; content: string }
interface Body { messages?: Message[] }

const buildPrompt = (transcript: string) => `
You are a precise data extractor for a recruitment platform. Read the hiring manager conversation transcript below and extract structured leadership, culture, and role data.

Return ONLY valid JSON — no markdown fences, no explanation, no extra text whatsoever.

The transcript contains NO personal identifiers (no names, no company names, no phone numbers) — do not try to infer or add any.

Transcript:
${transcript}

Return this exact JSON structure (use null for any value not mentioned):
{
  "industry": string | null,
  "role_type": string | null,
  "role_open_reason": "new_headcount" | "replacement" | "backfill" | null,
  "why_last_hire_left": string | null,
  "team_size": number | null,
  "hire_urgency": "urgent" | "normal" | "exploring" | null,
  "success_at_90_days": string | null,
  "hardest_part_of_role": string | null,
  "work_arrangement_offered": "on_site" | "hybrid" | "remote" | null,
  "must_have_items": string[],
  "screening_red_flags": string[],
  "leadership_tags": {
    "supportive": number,
    "collaborator": number,
    "analytical": number,
    "high_performance": number,
    "autonomous": number,
    "clear_communicator": number,
    "offers_flexibility": number,
    "offers_autonomy": number,
    "gives_recognition": number,
    "offers_growth": number,
    "transparent": number,
    "fair": number,
    "reliable": number,
    "growth_minded": number
  },
  "required_traits": string[],
  "culture_offers": {
    "wants_wlb": number,
    "wants_fair_pay": number,
    "wants_growth": number,
    "wants_stability": number,
    "wants_flexibility": number,
    "wants_recognition": number,
    "wants_mission": number,
    "wants_team_culture": number
  },
  "salary_offer_min": number | null,
  "salary_offer_max": number | null,
  "career_growth_potential": "dead_end" | "structured_path" | "ad_hoc" | null,
  "interview_stages": number | null,
  "panel_involved": boolean | null,
  "required_work_authorization": string[],
  "failure_at_90_days": string | null,
  "failure_pattern": string | null,
  "summary": string | null
}

Extraction rules:
- role_open_reason: "new_headcount" = brand new position, "replacement" = someone left/was let go, "backfill" = temporary cover.
- why_last_hire_left: 1 sentence summary of why the previous person left — no names. null if not a replacement or not discussed.
- team_size: number of people on the team this role joins (not including the HM). null if not mentioned.
- hire_urgency: "urgent" = need someone ASAP / within 2 weeks, "normal" = within 1-2 months, "exploring" = no fixed timeline.
- success_at_90_days: concrete description of what the new hire has achieved or can do after 90 days. 1-2 sentences, no names.
- hardest_part_of_role: what the HM said is most challenging or underestimated about this role.
- work_arrangement_offered: what the HM said they offer — on-site, hybrid, or remote.
- must_have_items: explicit non-negotiable requirements the HM stated. E.g. ["fluent Mandarin", "own transport", "willing to travel", "minimum 3 years sales experience"]. Empty array if none stated.
- screening_red_flags: what the HM said would disqualify a candidate. E.g. ["job-hoppers", "no sales background", "not willing to work weekends"]. Empty array if none.
- leadership_tags: score 0.0–1.0 based on demonstrated evidence of how the HM manages. Not what they claim, what they described.
- required_traits: talent tag names the HM wants. Use only: self_starter, collaborator, growth_minded, reliable, customer_focused, detail_oriented, analytical, accountable, clear_communicator, adaptable, leadership.
- culture_offers: what the team/company genuinely offers, inferred from HM's descriptions. 0.0–1.0.
- salary_offer_min / salary_offer_max: RM per month as numbers. Single number = use for both.
- career_growth_potential: "dead_end" = the HM explicitly said or implied there is no promotion path from this role. "structured_path" = there is a clear, stated path to grow or be promoted. "ad_hoc" = growth is possible but not structured or guaranteed.
- interview_stages: total number of interview rounds in their process. 1 = single interview. 2 = two rounds. null if not mentioned.
- panel_involved: true if there will be a panel interview or multiple interviewers in any round. false if it is always 1-on-1. null if not mentioned.
- required_work_authorization: list of work authorization types the HM will accept. Use only: "citizen", "pr", "ep", "rpt", "dp". Empty array if no restriction stated (anyone considered). Example: ["citizen", "pr"] if they said citizens and PRs only.
- failure_at_90_days: what the HM described as failure at day 90 — specific observable outcomes or missed deliverables. 1-2 sentences. null if not discussed.
- failure_pattern: the pattern of failure the HM has observed in past candidates for this type of role — what looked good on paper but broke down in practice. 1-2 sentences. null if not discussed.
- summary: 2-sentence recruiter-facing description of team culture and ideal candidate profile — no personal or company identifiers.
- DO NOT include any personal names, phone numbers, company names, or identifiers.
`.trim()

serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const auth = await authenticate(req, { requiredRoles: ['hiring_manager', 'hr_admin', 'admin'] })
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
    .map((m) => `${m.role === 'assistant' ? 'Bo' : 'Manager'}: ${m.content}`)
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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    })
    if (res.ok) {
      const data = await res.json() as { content: { type: string; text: string }[] }
      return parseJSON(data.content?.[0]?.text ?? '')
    }
  }

  if (groqKey) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    })
    if (res.ok) {
      const data = await res.json() as { choices: { message: { content: string } }[] }
      return parseJSON(data.choices?.[0]?.message?.content ?? '')
    }
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
