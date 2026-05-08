/**
 * moderate-role — AI compliance gate for job postings.
 *
 * Two-stage filter:
 *   1. Keyword prefilter — catches obvious blocklist hits (drug slang, sex-work
 *      euphemisms, money-mule phrasing). Keyword hits skip the LLM entirely
 *      and short-circuit to either auto-rejected or auto-flagged depending on
 *      severity. This both saves cost and guarantees a baseline regardless
 *      of provider availability.
 *   2. LLM classifier — Groq → Gemini → OpenAI → Anthropic provider chain
 *      mirroring draft-role-description. Returns structured JSON
 *      {risk_level, category, score 0..100, reasoning}.
 *
 * Decision matrix (after both stages):
 *   score < 25  AND clean       → moderation_status = 'approved'   (live)
 *   score 25-69 OR uncertain    → moderation_status = 'flagged'    (admin queue)
 *   score >= 70 OR clear-illegal → moderation_status = 'rejected'  (employer appeal)
 *
 * Caller patterns:
 *   - Authenticated HM/HR/admin: invoked from PostRole / EditRole right
 *     after the row is inserted/updated. They pass { role_id }.
 *   - Service role (cron, retries, admin recheck): same body.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { logAudit, extractIp } from '../_shared/audit.ts'

interface Body {
  role_id?: string
  /** When true, force a re-check even if moderation_status is already set. */
  force?: boolean
}

type Category =
  | 'pyramid_mlm'
  | 'money_muling'
  | 'drugs'
  | 'sex_work'
  | 'advance_fee_scam'
  | 'unlicensed_finance'
  | 'underage'
  | 'visa_fraud'
  | 'other_illegal'
  | 'clean'

type RiskLevel = 'clean' | 'review' | 'illegal'

interface ClassificationResult {
  risk_level: RiskLevel
  category: Category
  score: number          // 0..100
  reasoning: string      // short human explanation
  provider: string       // which LLM answered (or 'keyword_prefilter')
}

// --------------------------------------------------------------------------
// Keyword prefilter
// --------------------------------------------------------------------------

/** Patterns that almost always mean illegal — auto-reject without an LLM. */
const HARD_BLOCK: Array<{ pattern: RegExp; category: Category; reason: string }> = [
  // Drug trafficking / dealing
  { pattern: /\b(cocaine|heroin|meth|methamphetamine|crystal meth|crack|fentanyl|syabu|ganja|weed dealer|drug runner|drug courier|trafficker)\b/i,
    category: 'drugs',
    reason: 'Explicit reference to controlled substances or drug trafficking.' },

  // Money muling
  { pattern: /\b(money mule|smurfing|cash courier|bank drop|launder(ing)? (money|funds|cash)|wash (money|cash))\b/i,
    category: 'money_muling',
    reason: 'Explicit money-laundering / mule terminology.' },
  { pattern: /\b(receive|deposit|transfer)\s+(funds|money|cash)\s+(into|to)\s+your\s+(personal|own)\s+(bank\s+)?account\b/i,
    category: 'money_muling',
    reason: 'Asks employee to receive third-party funds into a personal bank account — classic mule pattern.' },

  // Sex work / trafficking euphemisms tied to recruiting
  { pattern: /\b(escort\s+(service|girls?|boys?)|gfe service|sugar (baby|daddy|momma)|sensual massage|happy ending|brothel|pimp|whoremaster)\b/i,
    category: 'sex_work',
    reason: 'Sex-work or trafficking-adjacent terminology.' },

  // Underage / child-targeted hiring
  { pattern: /\b(under\s*1[0-7]|below\s*18|minor[s]?\s+only|teen(s|agers)?\s+only|hire\s+(minors|children))\b/i,
    category: 'underage',
    reason: 'Targets workers below the legal working age (Malaysia: 15 with limits, 18 for most categories).' },
]

/** Patterns that are suspicious but ambiguous — auto-flag for admin review. */
const SOFT_FLAG: Array<{ pattern: RegExp; category: Category; reason: string }> = [
  // MLM / pyramid
  { pattern: /\b(downline|upline|recruit\s+more|invest(ment)?\s+package|joining\s+fee|capital\s+contribution|binary\s+system|matrix\s+system|pay-to-join|registration\s+fee\s+(of|rm|myr))\b/i,
    category: 'pyramid_mlm',
    reason: 'MLM / pay-to-join phrasing.' },
  { pattern: /\bmlm\b|\bpyramid\b|multi[- ]?level marketing/i,
    category: 'pyramid_mlm',
    reason: 'Direct MLM / pyramid reference.' },

  // Advance-fee fraud
  { pattern: /\b(send\s+(your\s+)?(passport|ic|nric|mykad)\s+(scan|copy|photo))\b/i,
    category: 'advance_fee_scam',
    reason: 'Requests sensitive ID documents up-front — fraud red flag.' },
  { pattern: /\b(processing\s+fee|training\s+fee|equipment\s+deposit|registration\s+fee|kit\s+fee|starter\s+pack)\b.*\b(rm|myr|usd|sgd|ringgit)\s*\d/i,
    category: 'advance_fee_scam',
    reason: 'Asks the candidate to pay before working — classic advance-fee scam.' },

  // Unlicensed finance
  { pattern: /\b(forex\s+trader|crypto\s+trader|binary\s+options|signal\s+provider|copy\s+trading)\b.*\b(no\s+licen[cs]e|no\s+(experience|background)\s+needed)\b/i,
    category: 'unlicensed_finance',
    reason: 'Solicits unlicensed financial activity.' },
  { pattern: /\b(loan\s+shark|ah\s*long|along\b|illegal\s+money\s*lend)/i,
    category: 'unlicensed_finance',
    reason: 'Loan-sharking / unlicensed money-lending language.' },

  // Visa fraud
  { pattern: /\b(fake\s+visa|visa\s+arrangement\s+for\s+a\s+fee|under-the-table\s+(work\s+)?permit|illegal\s+migrant\s+workers?)\b/i,
    category: 'visa_fraud',
    reason: 'References to circumventing immigration / work-permit law.' },

  // Sex work soft signals
  { pattern: /\b(model[s]?\s+wanted.*\b(no\s+experience|all\s+sizes|18\+))|companion\s+wanted|night\s+work\s+no\s+experience\b/i,
    category: 'sex_work',
    reason: 'Soft signals often used to disguise sex-work recruitment.' },
]

interface KeywordHit {
  severity: 'block' | 'flag'
  category: Category
  reason: string
  pattern: string
}

function keywordPrefilter(text: string): KeywordHit | null {
  for (const r of HARD_BLOCK) {
    const m = text.match(r.pattern)
    if (m) return { severity: 'block', category: r.category, reason: r.reason, pattern: m[0] }
  }
  for (const r of SOFT_FLAG) {
    const m = text.match(r.pattern)
    if (m) return { severity: 'flag', category: r.category, reason: r.reason, pattern: m[0] }
  }
  return null
}

// --------------------------------------------------------------------------
// LLM classifier
// --------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a compliance reviewer for DNJ, a Malaysia-focused recruitment platform. Your only job is to decide whether a job posting represents an illegal or fraudulent business.

Return STRICT JSON, no markdown, no preamble. Schema:
{
  "risk_level": "clean" | "review" | "illegal",
  "category": "pyramid_mlm" | "money_muling" | "drugs" | "sex_work" | "advance_fee_scam" | "unlicensed_finance" | "underage" | "visa_fraud" | "other_illegal" | "clean",
  "score": <integer 0..100, higher = riskier>,
  "reasoning": "<one sentence, max 240 chars, in English>"
}

Categories you must flag:
- pyramid_mlm: pay-to-join, recruit-to-earn, downline/upline structures, "investment packages", binary/matrix systems.
- money_muling: receiving funds into personal accounts, "transfer for commission", crypto cash-out roles without a registered MSB.
- drugs: trafficking, dealing, courier/runner roles for controlled substances. Pharmacist/dispensary at a licensed clinic is CLEAN.
- sex_work: escort, "GFE", "sugar baby", erotic massage. Legitimate massage therapy at a licensed spa is CLEAN.
- advance_fee_scam: candidate must pay a fee, deposit, training, kit, or send ID scans before working.
- unlicensed_finance: forex/crypto/signal "trader" with no licence, loan sharking ("ah long"), unregistered investment advice.
- underage: targets workers under 15, or under 18 for restricted categories (alcohol, gambling, late-night).
- visa_fraud: fake visa/work-permit arrangement, hiring undocumented workers as a feature.
- other_illegal: clear illegality not covered above (gambling without licence, smuggling, hacking-for-hire).

Scoring guide:
- 0-24 = clean (typical legitimate role: legal employer, lawful work, normal pay structure).
- 25-49 = mildly suspicious (vague description, unusual claims, but plausibly legitimate).
- 50-74 = likely problematic (fits a flagged category but ambiguous wording — admin should review).
- 75-100 = almost certainly illegal/fraudulent (explicit illegal request, clear scam pattern).

Be specific in reasoning. If clean, say briefly why ("legitimate <industry> role with standard duties"). Never invent quotes from the posting. Never refuse — always return JSON.`

interface RoleSnapshot {
  title: string
  description: string | null
  industry: string | null
  department: string | null
  location: string | null
  employment_type: string | null
  salary_min: number | null
  salary_max: number | null
  hourly_rate: number | null
  is_commission_based: boolean | null
  company_name: string | null
}

function buildUserPrompt(r: RoleSnapshot): string {
  const lines: string[] = []
  lines.push(`Title: ${r.title}`)
  if (r.industry) lines.push(`Industry: ${r.industry}`)
  if (r.department) lines.push(`Department: ${r.department}`)
  if (r.location) lines.push(`Location: ${r.location}`)
  if (r.employment_type) lines.push(`Employment type: ${r.employment_type.replace(/_/g, ' ')}`)
  if (r.company_name) lines.push(`Company: ${r.company_name}`)
  if (r.salary_min || r.salary_max) lines.push(`Salary range (RM/month): ${r.salary_min ?? '?'} – ${r.salary_max ?? '?'}`)
  if (r.hourly_rate) lines.push(`Hourly rate (RM): ${r.hourly_rate}`)
  if (r.is_commission_based) lines.push(`Compensation: commission-based / variable`)
  lines.push('')
  lines.push('Description:')
  lines.push(r.description?.trim() || '(no description provided)')
  lines.push('')
  lines.push('Return the JSON verdict.')
  return lines.join('\n')
}

function safeParseJson(text: string): unknown | null {
  try { return JSON.parse(text) } catch { /* fall through */ }
  // Strip code fences / preamble that some models add.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) { try { return JSON.parse(fence[1]) } catch { /* fall through */ } }
  const brace = text.match(/\{[\s\S]*\}/)
  if (brace) { try { return JSON.parse(brace[0]) } catch { /* fall through */ } }
  return null
}

function normalizeClassification(raw: unknown, provider: string): ClassificationResult | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const risk = String(o.risk_level ?? '').toLowerCase()
  const cat = String(o.category ?? '').toLowerCase()
  const score = Math.max(0, Math.min(100, Math.round(Number(o.score ?? 0))))
  const reasoning = typeof o.reasoning === 'string' ? o.reasoning.slice(0, 280) : ''

  const validRisk: RiskLevel[] = ['clean', 'review', 'illegal']
  const validCat: Category[] = [
    'pyramid_mlm','money_muling','drugs','sex_work','advance_fee_scam',
    'unlicensed_finance','underage','visa_fraud','other_illegal','clean',
  ]
  if (!validRisk.includes(risk as RiskLevel)) return null
  if (!validCat.includes(cat as Category)) return null
  return {
    risk_level: risk as RiskLevel,
    category: cat as Category,
    score: Number.isFinite(score) ? score : 50,
    reasoning: reasoning || 'No reasoning provided.',
    provider,
  }
}

async function classifyWithProviderChain(
  sys: string,
  usr: string,
): Promise<ClassificationResult | null> {
  const groqKey = Deno.env.get('GROQ_API_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

  // Groq — fastest, cheapest. Llama 3.3 70B with JSON mode.
  if (groqKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 400,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) {
        const j = await r.json()
        const text = j.choices?.[0]?.message?.content?.trim()
        const parsed = text ? safeParseJson(text) : null
        const norm = normalizeClassification(parsed, 'groq')
        if (norm) return norm
      } else {
        console.error('[moderate-role] groq error', r.status)
      }
    } catch (e) { console.error('[moderate-role] groq fetch failed', e) }
  }

  // Gemini 2.0 Flash with JSON mode.
  if (geminiKey) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: 'user', parts: [{ text: usr }] }],
          generationConfig: {
            maxOutputTokens: 400,
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) {
        const j = await r.json()
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        const parsed = text ? safeParseJson(text) : null
        const norm = normalizeClassification(parsed, 'gemini')
        if (norm) return norm
      } else {
        console.error('[moderate-role] gemini error', r.status)
      }
    } catch (e) { console.error('[moderate-role] gemini fetch failed', e) }
  }

  // OpenAI gpt-4o-mini.
  if (openaiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 400,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) {
        const j = await r.json()
        const text = j.choices?.[0]?.message?.content?.trim()
        const parsed = text ? safeParseJson(text) : null
        const norm = normalizeClassification(parsed, 'openai')
        if (norm) return norm
      } else {
        console.error('[moderate-role] openai error', r.status)
      }
    } catch (e) { console.error('[moderate-role] openai fetch failed', e) }
  }

  // Anthropic Claude Haiku 4.5 — last in the chain (highest latency in this stack).
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
          max_tokens: 400,
          temperature: 0,
          system: sys,
          messages: [{ role: 'user', content: usr }],
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) {
        const j = await r.json()
        const text = j.content?.[0]?.text?.trim()
        const parsed = text ? safeParseJson(text) : null
        const norm = normalizeClassification(parsed, 'anthropic')
        if (norm) return norm
      } else {
        console.error('[moderate-role] anthropic error', r.status)
      }
    } catch (e) { console.error('[moderate-role] anthropic fetch failed', e) }
  }

  return null
}

// --------------------------------------------------------------------------
// Decision logic
// --------------------------------------------------------------------------

function decideStatus(c: ClassificationResult): 'approved' | 'flagged' | 'rejected' {
  if (c.risk_level === 'illegal' || c.score >= 70) return 'rejected'
  if (c.risk_level === 'review' || c.score >= 25) return 'flagged'
  return 'approved'
}

// --------------------------------------------------------------------------
// Handler
// --------------------------------------------------------------------------

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['hiring_manager', 'hr_admin', 'admin'],
  })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* tolerate */ }
  const roleId = body.role_id?.trim()
  if (!roleId) return json({ error: 'Missing role_id' }, 400)
  if (!/^[0-9a-f-]{36}$/i.test(roleId)) return json({ error: 'Invalid role_id' }, 400)

  const db = adminClient()

  // Load the role + company name (used by the classifier prompt).
  const { data: role, error: roleErr } = await db
    .from('roles')
    .select(`
      id, hiring_manager_id, title, description, industry, department, location,
      employment_type, salary_min, salary_max, hourly_rate, is_commission_based,
      moderation_status, moderation_attempts,
      hiring_managers!inner(company_id, profile_id, companies(name))
    `)
    .eq('id', roleId)
    .maybeSingle()

  if (roleErr) return json({ error: roleErr.message }, 500)
  if (!role) return json({ error: 'Role not found' }, 404)

  // Authorization: HM may only moderate their own role; admin/service can do any.
  if (auth.role === 'hiring_manager') {
    const hmProfileId = (role.hiring_managers as { profile_id?: string } | null)?.profile_id
    if (hmProfileId !== auth.userId) {
      return json({ error: 'Forbidden: not the role owner.' }, 403)
    }
  }

  // Idempotency: skip work if already decided unless force=true or admin.
  if (!body.force && role.moderation_status !== 'pending' && auth.role !== 'admin' && !auth.isServiceRole) {
    return json({
      role_id: roleId,
      status: role.moderation_status,
      skipped: true,
      reason: 'Already moderated; pass force=true as admin to recheck.',
    })
  }

  // Cap retries — if we've already attempted 5 times and still pending,
  // surface to the queue rather than burning more LLM budget.
  if ((role.moderation_attempts ?? 0) >= 5 && !body.force) {
    await db.from('roles').update({
      moderation_status: 'flagged',
      moderation_reason: 'Auto-escalated to admin queue after 5 failed classification attempts.',
      moderation_category: 'other_illegal',
      moderation_checked_at: new Date().toISOString(),
    }).eq('id', roleId)
    await db.from('role_moderation_events').insert({
      role_id: roleId, event_type: 'rechecked',
      prev_status: role.moderation_status, new_status: 'flagged',
      reason: 'Max attempts reached; surfaced to admin queue.',
    })
    return json({ role_id: roleId, status: 'flagged', escalated: true })
  }

  const company = (role.hiring_managers as { companies?: { name?: string | null } | null } | null)?.companies
  const snapshot: RoleSnapshot = {
    title: role.title,
    description: role.description,
    industry: role.industry ?? null,
    department: role.department ?? null,
    location: role.location ?? null,
    employment_type: role.employment_type ?? null,
    salary_min: role.salary_min ?? null,
    salary_max: role.salary_max ?? null,
    hourly_rate: role.hourly_rate ?? null,
    is_commission_based: role.is_commission_based ?? null,
    company_name: company?.name ?? null,
  }

  const corpus = [snapshot.title, snapshot.description ?? '', snapshot.industry ?? '', snapshot.department ?? '']
    .join('\n')
    .toLowerCase()

  // ---------- Stage 1: keyword prefilter ----------
  const hit = keywordPrefilter(corpus)
  let result: ClassificationResult | null = null
  let eventType: string

  if (hit && hit.severity === 'block') {
    result = {
      risk_level: 'illegal',
      category: hit.category,
      score: 95,
      reasoning: hit.reason,
      provider: 'keyword_prefilter',
    }
    eventType = 'keyword_block'
  } else {
    // ---------- Stage 2: LLM classifier ----------
    const sys = SYSTEM_PROMPT
    const usr = buildUserPrompt(snapshot)
    result = await classifyWithProviderChain(sys, usr)

    // If the LLM completely failed, fall back to soft-flag (safer than approving).
    if (!result) {
      if (hit && hit.severity === 'flag') {
        result = {
          risk_level: 'review',
          category: hit.category,
          score: 60,
          reasoning: `LLM unavailable; keyword soft-flag fallback: ${hit.reason}`,
          provider: 'keyword_fallback',
        }
        eventType = 'keyword_block'
      } else {
        // Increment attempts and leave as pending so a retry cron can pick it up.
        await db.from('roles').update({
          moderation_attempts: (role.moderation_attempts ?? 0) + 1,
        }).eq('id', roleId)
        return json({ error: 'No moderation provider available; will retry.' }, 503)
      }
    } else if (hit && hit.severity === 'flag') {
      // Combine: LLM verdict wins on category, but never let it be cleaner than
      // a soft-flag baseline.
      if (result.risk_level === 'clean') {
        result = {
          ...result,
          risk_level: 'review',
          score: Math.max(result.score, 35),
          reasoning: `${result.reasoning} (Soft-flag: ${hit.reason})`,
        }
      }
      eventType = result.risk_level === 'illegal' ? 'llm_rejected' : 'llm_flagged'
    } else {
      eventType = result.risk_level === 'illegal' ? 'llm_rejected'
        : result.risk_level === 'review' ? 'llm_flagged'
        : 'auto_approved'
    }
  }

  if (!result) {
    return json({ error: 'Moderation result undefined.' }, 500)
  }

  // ---------- Persist ----------
  const newStatus = decideStatus(result)
  const checkedAt = new Date().toISOString()

  const { error: upErr } = await db.from('roles').update({
    moderation_status: newStatus,
    moderation_score: result.score,
    moderation_category: result.category,
    moderation_reason: result.reasoning,
    moderation_provider: result.provider,
    moderation_checked_at: checkedAt,
    moderation_attempts: (role.moderation_attempts ?? 0) + 1,
  }).eq('id', roleId)

  if (upErr) return json({ error: upErr.message }, 500)

  await db.from('role_moderation_events').insert({
    role_id: roleId,
    event_type: eventType,
    prev_status: role.moderation_status,
    new_status: newStatus,
    score: result.score,
    category: result.category,
    reason: result.reasoning,
    provider: result.provider,
    actor_id: auth.isServiceRole ? null : auth.userId,
  })

  // Audit trail (admin-visible).
  await logAudit({
    actorId: auth.isServiceRole ? null : auth.userId,
    actorRole: auth.role,
    subjectId: null,
    action: 'admin_action',
    resourceType: 'role',
    resourceId: roleId,
    ip: extractIp(req),
    ua: req.headers.get('user-agent') ?? '',
    metadata: {
      kind: 'role_moderation',
      status: newStatus,
      category: result.category,
      score: result.score,
      provider: result.provider,
    },
  })

  // On approval, kick match-generate so candidates surface without waiting
  // for the rematch cron. Best effort — failures are not fatal here.
  if (newStatus === 'approved' && role.moderation_status !== 'approved') {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      void fetch(`${supabaseUrl}/functions/v1/match-generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${svcKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role_id: roleId }),
        signal: AbortSignal.timeout(20000),
      }).catch((e) => console.error('[moderate-role] match-generate kick failed', e))
    } catch (e) {
      console.error('[moderate-role] match-generate kick threw', e)
    }
  }

  return json({
    role_id: roleId,
    status: newStatus,
    score: result.score,
    category: result.category,
    reason: result.reasoning,
    provider: result.provider,
  })
})
