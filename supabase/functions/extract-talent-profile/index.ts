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

The transcript contains NO personal identifiers (no names, no phone numbers, no IC numbers, no employer names) — do not try to infer or add any.

Transcript:
${transcript}

Return this exact JSON structure (use null for any value not mentioned):
{
  "current_employment_status": "employed" | "unemployed" | "freelancing" | "studying" | null,
  "current_salary": number | null,
  "notice_period_days": number | null,
  "reason_for_leaving_category": "salary" | "growth" | "culture" | "personal" | "redundancy" | "contract_end" | "relocation" | "career_pivot" | "other" | null,
  "reason_for_leaving_summary": string | null,
  "years_experience": number | null,
  "education_level": "spm" | "diploma" | "degree" | "masters" | "phd" | "professional_cert" | "other" | null,
  "has_management_experience": boolean | null,
  "management_team_size": number | null,
  "job_areas": string[],
  "key_skills": string[],
  "career_goals": string | null,
  "salary_min": number | null,
  "salary_max": number | null,
  "work_authorization": "citizen" | "pr" | "ep" | "rpt" | "dp" | "student_pass" | "other" | null,
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
    "leadership": number,
    "ownership": number,
    "communication_clarity": number,
    "emotional_maturity": number,
    "problem_solving": number,
    "resilience": number,
    "results_orientation": number,
    "professional_attitude": number,
    "confidence": number,
    "coachability": number
  },
  "wants_wlb": number,
  "wants_fair_pay": number,
  "wants_growth": number,
  "wants_stability": number,
  "wants_flexibility": number,
  "wants_recognition": number,
  "wants_mission": number,
  "wants_team_culture": number,
  "preferred_management_style": "hands_on" | "autonomous" | "collaborative" | null,
  "deal_breaker_items": string[],
  "red_flags": string[],
  "summary": string | null,
  "employment_type_preferences": string[]
}

Extraction rules:
- current_employment_status: "employed" if currently working, "unemployed" if between jobs, "freelancing" if self-employed/contract, "studying" if full-time student.
- current_salary: RM per month as a number. Extract even if given as a range (use midpoint). null if never mentioned or refused.
- notice_period_days: convert to days. "1 month" = 30, "2 weeks" = 14, "immediate" = 0, "3 months" = 90.
- reason_for_leaving_category: pick the single best fit. "salary" = underpaid. "growth" = career ceiling. "culture" = bad environment/manager. "personal" = family, health, relocation. "redundancy" = laid off. "contract_end" = fixed-term ended. "career_pivot" = changing field entirely. "other" = anything else.
- reason_for_leaving_summary: 1 sentence max, no employer names. Captures the honest reason stated.
- years_experience: total years working, across all roles. If they say "5 years in F&B and 2 years in retail", output 7.
- education_level: "spm" = high school cert, "diploma", "degree" = bachelor, "masters", "phd", "professional_cert" = ACCA/CPA/CIMA/etc.
- has_management_experience: true if they have ever managed or led people formally. false if explicitly never. null if not discussed.
- management_team_size: largest team they have directly managed. null if no management experience.
- job_areas: include specific role AND industry, e.g. ["barista", "F&B", "cafe management", "team lead"].
- key_skills: concrete skills, tools, or domain knowledge mentioned — not generic traits.
- salary_min / salary_max: expected salary range in RM per month. If single number given, use for both.
- work_authorization: "citizen" = Malaysian IC, "pr" = permanent resident, "ep" = Employment Pass, "rpt" = Residence Pass-Talent, "dp" = Dependant Pass, "student_pass" = ineligible to work, "other" = any other pass.
- derived_tags: score 0.0–1.0 from interview evidence only:
  · ownership: uses "I/me/my" for actions and outcomes (not "we/they"). Takes personal responsibility for failures. 0 = consistent deflection.
  · communication_clarity: structured, specific, measurable STAR-format answers. 0 = vague, rambling, generic.
  · emotional_maturity: calm discussing conflict, bad managers, feedback. No employer bad-mouthing. 0 = hostile or dismissive.
  · problem_solving: clear analytical framework, states trade-offs, measurable outcomes. 0 = absent or illogical reasoning.
  · resilience: owns failures, articulates clear lessons, shows changed behaviour. 0 = denies failure or shows no learning.
  · results_orientation: quantifies impact with RM, %, time, volume, headcount. 0 = entirely activity-based, no outcomes.
  · professional_attitude: frames past employers positively even when things went wrong. 0 = blames, mocks, or disparages.
  · confidence: backs claims with concrete evidence, shows conviction without arrogance. 0 = hedges every statement.
  · coachability: gives specific before/after example of feedback received and acted on. 0 = "I'm always open to feedback" with no story.
- wants_* tags: infer 0.0–1.0 from what candidate said they value.
- preferred_management_style: how they prefer to be managed based on what they said.
- deal_breaker_items: explicit hard nos mentioned — e.g. ["no weekend work", "no commission-only", "no relocation"]. Empty array if none stated.
- red_flags: specific concerns observed in the conversation — e.g. ["bad-mouths previous employer", "vague on all behavioural questions", "unemployed 8+ months with no explanation", "job-hopped 4 times in 3 years", "unrealistic salary expectation", "contradicts own stated values"]. Empty array if none.
- summary: 2-sentence recruiter-facing summary of career background and strengths — no personal details, no employer names.
- employment_type_preferences: use only "full_time", "part_time", "contract", "gig", "internship". Empty array if not mentioned.
- DO NOT include name, phone, email, company names, or any personal identifiers.
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
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
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
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
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
