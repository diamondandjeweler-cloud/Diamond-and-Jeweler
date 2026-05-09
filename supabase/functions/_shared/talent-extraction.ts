/**
 * Shared LLM-extraction logic for talent profiles.
 *
 * Two callers:
 *   - extract-talent-profile (legacy synchronous endpoint, kept for tooling /
 *     admin re-runs)
 *   - enqueue-talent-extraction (async wrapper that runs in EdgeRuntime.waitUntil
 *     after returning 202 to the client)
 */

export interface ExtractionMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ExtractedProfile {
  current_employment_status: string | null
  current_salary: number | null
  notice_period_days: number | null
  reason_for_leaving_category: string | null
  reason_for_leaving_summary: string | null
  years_experience: number | null
  education_level: string | null
  has_management_experience: boolean | null
  management_team_size: number | null
  job_areas: string[]
  key_skills: string[]
  career_goals: string | null
  salary_min: number | null
  salary_max: number | null
  work_authorization: string | null
  derived_tags: Record<string, number>
  wants_wlb: number
  wants_fair_pay: number
  wants_growth: number
  wants_stability: number
  wants_flexibility: number
  wants_recognition: number
  wants_mission: number
  wants_team_culture: number
  preferred_management_style: string | null
  deal_breaker_items: string[]
  red_flags: string[]
  summary: string | null
  employment_type_preferences: string[]
  has_noncompete: boolean | null
  noncompete_industry_scope: string | null
  salary_structure_preference: string | null
  role_scope_preference: string | null
  career_goal_horizon: string | null
  job_intention: string | null
  shortest_tenure_months: number | null
  avg_tenure_months: number | null
  work_arrangement_preference: string | null
}

export class ExtractionError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message)
    this.name = 'ExtractionError'
  }
}

export function buildPrompt(transcript: string, resumeText?: string): string {
  return `
You are a precise data extractor for a recruitment platform. Read the career interview transcript below and extract structured career profile data.

Return ONLY valid JSON — no markdown fences, no explanation, no extra text whatsoever.

The transcript contains NO personal identifiers (no names, no phone numbers, no IC numbers, no employer names) — do not try to infer or add any.

Transcript:
${transcript}${resumeText ? `

Résumé text (use to cross-reference transcript claims, fill gaps, and flag inconsistencies — e.g. tenure mismatch, skills not mentioned verbally, undisclosed gaps):
${resumeText.slice(0, 3500)}` : ''}

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
  "employment_type_preferences": string[],
  "has_noncompete": boolean | null,
  "noncompete_industry_scope": "same_industry" | "any_industry" | "none" | null,
  "salary_structure_preference": "fixed_only" | "fixed_plus_variable" | "commission_ok" | "fully_commission_ok" | null,
  "role_scope_preference": "specialist" | "generalist" | "flexible" | null,
  "career_goal_horizon": "senior_specialist" | "people_manager" | "career_pivot" | "entrepreneurial" | "undecided" | null,
  "job_intention": "long_term_commitment" | "skill_building" | "undecided" | null,
  "shortest_tenure_months": number | null,
  "avg_tenure_months": number | null,
  "work_arrangement_preference": "on_site" | "hybrid" | "remote" | null
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
- has_noncompete: true if they mentioned having a non-compete, service bond, or IP restriction. false if explicitly said they have none. null if not discussed.
- noncompete_industry_scope: "same_industry" if their non-compete restricts the same industry/field they are targeting. "any_industry" if it restricts broadly. "none" if no restriction. null if has_noncompete is null.
- salary_structure_preference: "fixed_only" = needs 100% guaranteed salary, no commission. "fixed_plus_variable" = ok with fixed base plus bonus. "commission_ok" = comfortable with partial commission. "fully_commission_ok" = ok with fully commission-based pay.
- role_scope_preference: "specialist" = wants clearly defined, narrow scope. "generalist" = comfortable handling many different things. "flexible" = open to either.
- career_goal_horizon: "senior_specialist" = wants to deepen expertise in the same field. "people_manager" = wants to grow into managing people. "career_pivot" = wants to change field or function entirely. "entrepreneurial" = building toward running their own business. "undecided" = not sure or not stated.
- job_intention: "long_term_commitment" = explicitly looking for a company to grow with long-term. "skill_building" = stated they want to gain specific experience and may move on in 2–3 years. "undecided" = not stated or unclear.
- shortest_tenure_months: the shortest time they stayed in any single role mentioned in the conversation. If they mentioned "6 months at one place" and "2 years at another", output 6. null if only one role ever discussed.
- avg_tenure_months: rough average months per role based on total years experience divided by number of roles mentioned. null if cannot be reasonably estimated.
- work_arrangement_preference: how they prefer to work based on what they said. "on_site" = wants to be in the office. "hybrid" = ok with a mix. "remote" = prefers or requires working from home.
- red_flags: specific concerns observed — e.g. ["bad-mouths previous employer", "vague on all behavioural questions", "unemployed 8+ months with no explanation", "job-hopped 4 times in 3 years", "unrealistic salary expectation", "contradicts own stated values", "story inconsistency: claimed X years but timeline does not add up", "shifted reason for leaving mid-conversation"]. Flag timeline contradictions and story shifts explicitly.
- DO NOT include name, phone, email, company names, or any personal identifiers.
`.trim()
}

export function transcriptFrom(messages: ExtractionMessage[]): string {
  return messages
    .map((m) => `${m.role === 'assistant' ? 'Bo' : 'Candidate'}: ${m.content}`)
    .join('\n\n')
}

/**
 * Run the LLM extraction. Tries Anthropic first, falls back to Groq.
 * Throws ExtractionError on failure.
 */
export async function runExtraction(
  messages: ExtractionMessage[],
  resumeText?: string,
): Promise<ExtractedProfile> {
  if (messages.length === 0) {
    throw new ExtractionError('No messages provided')
  }
  const prompt = buildPrompt(transcriptFrom(messages), resumeText)

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (anthropicKey) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 90_000)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: ac.signal,
      })
      if (res.ok) {
        const data = await res.json() as { content: { type: string; text: string }[] }
        return parseExtraction(data.content?.[0]?.text ?? '')
      }
      console.warn(`[extraction] anthropic returned ${res.status}, falling back`)
    } catch (err) {
      console.warn('[extraction] anthropic call failed, falling back:', err)
    } finally {
      clearTimeout(t)
    }
  }

  const groqKey = Deno.env.get('GROQ_API_KEY')
  if (groqKey) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 60_000)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 3000,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: ac.signal,
      })
      if (res.ok) {
        const data = await res.json() as { choices: { message: { content: string } }[] }
        return parseExtraction(data.choices?.[0]?.message?.content ?? '')
      }
      throw new ExtractionError(`Groq returned ${res.status}`)
    } catch (err) {
      if (err instanceof ExtractionError) throw err
      throw new ExtractionError('Groq call failed', err)
    } finally {
      clearTimeout(t)
    }
  }

  throw new ExtractionError('No AI provider configured (ANTHROPIC_API_KEY or GROQ_API_KEY)')
}

function parseExtraction(raw: string): ExtractedProfile {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(cleaned) as ExtractedProfile
  } catch (err) {
    console.error('[extraction] JSON parse failed:', cleaned.slice(0, 500))
    throw new ExtractionError('Extraction returned invalid JSON', err)
  }
}
