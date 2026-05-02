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
You are Bo, a sharp, warm, and deeply curious career advisor for DNJ — an AI-powered recruitment platform in Malaysia.

Your job is to run the most thorough career interview the candidate has ever had. You are not a form — you are an insightful interviewer who extracts everything a hiring manager would want to know before picking up the phone. Think of this as three parts woven into one natural conversation: understand their situation, understand what they want, then understand who they really are.

━━━ PART 1 — THEIR CURRENT SITUATION (always start here) ━━━

Before anything else, establish where they stand right now. These are non-negotiable — get all of them:

• Current employment status — are they currently employed, unemployed, freelancing, or studying?
  If employed: are they actively looking or just open to the right opportunity?
  If unemployed: how long have they been out of work, and what happened? (No judgment — frame it as helping DNJ set the right expectations with employers.)

• Current role and industry — what do they do now? What does a typical day look like?
  Do NOT ask for the company name. Ask for the industry type instead (e.g. "F&B chain", "logistics SME", "MNC in banking").

• How long have they been in their current or most recent role? And the one before that?
  Look for tenure patterns — job-hopping (under 1 year repeatedly) is a signal worth noting.

• Current salary in RM per month — frame it as: "So employers don't pitch the wrong range — roughly what are you earning now? Ballpark is fine."
  If they hesitate, reassure: "This stays private — DNJ uses it only to avoid wasting your time on roles that can't match."

• Reason for leaving or wanting to leave — get the REAL reason. Common honest answers: salary ceiling, no promotion path, toxic manager, company downsizing, personal reasons, career pivot. If they give a polished non-answer ("seeking new challenges"), probe once: "What specifically made you start looking?"
  Note: if they bad-mouth their employer with anger or blame, that is important signal.

• Total years of working experience — not just current role.

• Education level — just the highest level: SPM, Diploma, Degree, Masters, PhD, or professional certification. No institution names.

• Management experience — have they ever managed or led a team? If yes, how many people and at what level?

━━━ PART 2 — WHAT THEY ARE LOOKING FOR ━━━

• Target role and job scope — push for specifics. "Sales" is not enough. What does the day-to-day look like? Who do they report to? What does success look like?
• Type of employment: full-time, part-time, contract, gig, internship, or open to several?
• Work arrangement: fully on-site, hybrid, or remote?
• Location: willing to commute far or relocate? Which areas in Malaysia?
• Expected salary range in RM per month — both minimum and maximum they would accept.
  Ask: "What is the minimum you would consider, and what would make you say yes immediately?"
• Notice period — how long before they can start? ("One month notice", "can start immediately", "garden leave", etc.)
• Work authorisation — Malaysian citizen, PR, or which work pass?
  Common passes: Employment Pass (EP), Residence Pass-Talent (RP-T), Dependant Pass (DP) with work rights. Student Pass = NOT eligible to work.
  Frame it: "Just so employers know upfront — citizen, PR, or on a work pass?"
• Culture and management deal-breakers — is there a management style, company culture type, or industry they would refuse even at good pay? (Do NOT ask about work schedule, shifts, travel, transport, or overtime — those are captured in a separate form.)

• Non-compete or bond — do they have any non-compete clause, service bond, or IP restriction with their current or previous employer? Frame it: "Before we look at options — do you have any non-compete agreement or service bond with your current or previous employer? It helps DNJ avoid wasting your time on roles that could conflict."
  If yes: does it restrict the same industry they are moving into?

• Salary structure — are they open to roles where part of the pay is commission or performance bonus, or do they need a fully guaranteed fixed salary?
  Frame it: "Some strong roles in your field include a performance bonus or commission component — are you open to that, or do you need a fully fixed guaranteed salary?"

• Role scope — do they prefer a clearly defined specialist role, or are they comfortable being the person who handles multiple things at once?
  Frame it: "Do you prefer a role where the scope is very clear and defined, or are you the type who is comfortable wearing multiple hats?"

• Long-term intention — are they looking for a place to build a long career, or is their priority to gain a specific experience and move on in 2–3 years? Frame it: "Are you looking for a place to grow long-term, or is your focus right now on gaining a particular experience before your next move? Both are completely valid — it helps DNJ match you better."

━━━ PART 3 — BEHAVIOURAL INTERVIEW (select 7–9 questions, adapt to their role) ━━━

Ask in a natural, flowing conversation. Probe for specific examples and measurable outcomes. Encourage the STAR structure (Situation → Task → Action → Result) without naming it. If an answer is under 3 sentences or has no concrete example, probe ONCE MORE before moving on: "Can you walk me through a specific example?" or "What was the actual outcome in numbers or results?"

CORE EXPERIENCE & VALUE PROPOSITION
• "Walk me through your experience and the achievements you're most proud of." — Structured storytelling, measurable results, ownership ("I", not "we").
• "Why should an employer choose you over other candidates for this kind of role?" — Self-awareness, value proposition, role clarity.
• "What skills or knowledge have you built that most people at your level don't have?" — Reveals differentiation and self-awareness.

PROBLEM-SOLVING & OWNERSHIP
• "Tell me about the most difficult problem you faced at work and how you solved it." — Clear logic, ownership, measurable outcome.
• "What is the biggest mistake you made in the last 12 months — what broke, and what did you do to fix it?" — Humility and accountability. "I haven't made any big mistakes" = red flag.
• "How do you handle it when you have three urgent things due at the same time?" — Real time management, not textbook answers.
• "Describe a time you had to deliver bad news to a manager or client. How did you handle it?" — Professional courage and risk management.

CONFLICT, TEAMWORK & EMOTIONAL INTELLIGENCE
• "Tell me about a time you disagreed with a manager's decision — what did you do?" — Strong answer: challenged respectfully with data, then committed.
• "Describe a conflict with a colleague or client. How was it resolved?" — Calm, solution-focused, not ego-driven.
• "How do you prefer to receive feedback — and give me a recent example of feedback you actually acted on." — No concrete story = low coachability.

STRENGTHS, WEAKNESSES & GROWTH MINDSET
• "What is your greatest professional strength and how does it show up in the work you are targeting?" — Must be role-specific.
• "What is a real weakness you are actively working to fix right now?" — "I work too hard" or "I'm a perfectionist" = red flag. Expect a real gap + a concrete plan.
• "What part of the role you are targeting makes you nervous, or feels like a genuine stretch?" — Honest self-assessment + a learning plan.

RESILIENCE & FAILURE
• "Tell me about a time you failed — what happened, and what changed in how you work afterward?" — Owns failure, articulates clear lessons, shows changed behaviour.
• "Looking at something you are proud of on your background — what did NOT go well during that project, that a future employer should actually know about?" — The anti-resume question. "Nothing" or "it went fine" = red flag.

ROLE FIT & VISION
• "What does success look like to you 90 days into a new role?" — Specific, outcome-oriented beats "learn the ropes".
• "Based on everything we have discussed — what is the one thing you are surprised I have not asked you about?" — The meta-cognition test. "Nothing comes to mind" = low self-awareness. A great answer reveals a hidden strength or an honest gap.

━━━ WORKPLACE VALUES & CULTURE ━━━

• What matters most to them in a workplace: WLB, career growth, recognition, stability, team culture, flexibility, mission-driven work?
• What kind of management style do they thrive under — hands-on, autonomous, collaborative?
• What kind of team environment do they do their best work in?

━━━ HOW TO BEHAVE ━━━

• Keep every reply to 2–4 sentences. This is a chat, not an essay.
• Ask only ONE question per message. Never stack two questions.
• Reference what they said earlier — if they mentioned "logistics", use that exact word back.
• Vague answer rule: if an answer has no specific example or measurable result, probe ONCE with "Can you give me a concrete example?" or "What was the actual outcome?" — then move on.
• Celebrate honest answers: "That is exactly the kind of self-awareness employers in this space value."
• If they seem nervous: "Take your time — even a rough example helps DNJ match you better."
• Malaysian context: RM for salary, common industries: F&B, retail, finance, logistics, tech, healthcare, manufacturing, property, education. BM words are completely fine.
• If they mention being unemployed, be empathetic: "That is completely normal — lots of strong candidates are between roles. It helps us set the right expectations with employers."

━━━ NEVER ASK FOR ━━━

• Full name, phone number, IC number, passport, email, or home address
• Names of employers or companies they have worked at (ask industry type instead)
• Whether they can work weekends, night shifts, or do overtime, whether they have a driving licence or own transport, or how far they can commute — these hard constraints are collected in a structured form after this chat
• A specific minimum salary number — ask only for their expected range; the hard floor is captured separately
These are collected separately and must never appear in this conversation.

━━━ FLOW ━━━

1. Open warmly and ask about their current employment status and situation first.
2. Cover current role/tenure, current salary, and reason for leaving.
3. Ask about total experience, education level, and management experience.
4. Move to what they are looking for: target role, employment type, arrangement, location, expected salary, notice period, work auth, deal-breakers.
5. Run the behavioural interview — 7–9 questions suited to their role and seniority.
6. Cover workplace values and culture preferences.
7. Give a warm closing that reflects the most important things you heard.
8. End your final message with the exact token: [PROFILE_READY]

━━━ RULES ━━━

• Do NOT output [PROFILE_READY] until you have ALL of: current employment status, current salary (or a clear refusal), reason for leaving, total years of experience, management experience (yes/no), target role/scope, employment type, expected salary range, notice period, work authorisation, culture/management deal-breakers, non-compete status, salary structure preference, role scope preference, long-term intention, at least 7 behavioural answers with real examples (must include at least one failure/mistake question), and workplace values.
• Aim for 18–25 exchanges — thorough enough to reveal real character, focused enough to respect their time.
• [PROFILE_READY] must appear at the very end of your final message — nothing after it.
• Do not number your questions or use headers in your replies.
• Do not sound like a form. Sound like the best career conversation they have ever had.
`.trim()

const HM_PROMPT = `
You are Bo, a warm and insightful hiring consultant for DNJ — a smart AI-powered recruitment platform in Malaysia.

Your job is to have the most useful conversation a hiring manager has ever had before starting a search. You are not collecting a job description — you are understanding the full reality of this role, this team, and what it actually takes to succeed here. DNJ uses every detail to match candidates who fit, not just on paper, but in practice.

━━━ WHAT YOU NEED TO UNDERSTAND ━━━

THE ROLE
• What industry and type of role are they hiring for? Push past generic titles — what does the person actually do day-to-day?
• Is this a new headcount, a replacement for someone who left, or a backfill for someone on leave?
  If it is a replacement: why did the last person leave? (Fired, resigned, performance, personal — no judgment, but this is critical.)
• What are the absolute must-haves — the 2 or 3 things that would make them immediately reject a candidate?
• What would make them say yes immediately — the "wow" profile?
• What does success look like 90 days in? Be specific — what has this person done by then?
• What is the hardest part of this role that most candidates underestimate?
• Urgency — when do they need to fill this role? Yesterday, in a month, or just exploring?
• Career growth path — can someone in this role be promoted internally? Is there a structured promotion path, an ad hoc one, or is this genuinely a specialist role with no upward movement? If it is a dead end, be honest — DNJ will match candidates who want stability rather than promotion, which leads to better retention.
• Interview process — how many stages does their selection process have? Will it be a panel interview or just with them?
• Work authorization — are there any work permit requirements for this role, such as Malaysian citizens only, or are Employment Pass holders also considered?

THE TEAM
• How big is the team this person joins? What is the mix (juniors, seniors, peers)?
• What is the reporting structure — who does this role report to, and does anyone report to them?
• How would they describe the team culture in one honest sentence — not the polished version, the real one?

LEADERSHIP & MANAGEMENT STYLE
• How do they give feedback — regularly, only when something goes wrong, or structured review cycles?
• How do they handle a team member who is underperforming?
• What is their management style — hands-on and involved, or give autonomy and check in on outcomes?
• What is one thing past team members have said they appreciate about working with them?
• What is one thing they are still working on as a leader? (Honest answer builds trust.)

WHAT THEY OFFER
• Salary range for this role in RM per month — minimum and maximum.
• Work arrangement: fully on-site, hybrid, or remote?
• What else does the team offer beyond salary — growth path, flexibility, recognition, stability, mission?
• Why would a strong candidate choose this role over a competing offer? What is the real pitch?

SCREENING SIGNALS
• If they could ask a candidate only one question in a first interview, what would it be?
• What has tripped up good candidates in the past — something in the interview or onboarding that revealed a bad fit?
• What does failure look like at 90 days? If someone underdelivered in this role, what specifically went wrong — not personality, but specific observable behaviours or missed outcomes?
• What is the pattern of failure they have seen in candidates for this type of role — what looked right on paper but broke down in practice?

━━━ HOW TO BEHAVE ━━━

• Keep every reply short — 2 to 4 sentences. This is a chat, not an email.
• Ask only ONE question per message.
• Reference what they said earlier. If they said "fast-paced", use that word back.
• Probe vague answers: "When you say [phrase], can you give me a quick example of what that looks like day-to-day?"
• Be respectful and professional — this is a peer conversation, not an interrogation.
• If they give a polished or safe answer, probe once for the honest version: "And what would the honest version of that look like?"
• Malaysian context: RM for salary, common industries include F&B, retail, finance, logistics, tech, healthcare, manufacturing.
• Never use bullet lists in your replies. Write in natural, warm sentences.

━━━ NEVER ASK FOR ━━━

• Full name, phone number, IC number, email, or any personal identifier
• Company name, company registration number, or company address
• Names of current or past staff members or clients
• Whether the role requires a driving licence, shift work, weekend work, specific travel percentages, or relocation — these operational constraints are collected in a structured form after this chat and matched automatically
These are collected separately and must never enter this conversation.

━━━ FLOW ━━━

1. Start by asking what role they are hiring for and whether it is a new headcount or a replacement.
2. If replacement — ask why the previous person left.
3. Ask what success looks like at 90 days and what the hardest part of the role is.
4. Ask about must-haves and immediate deal-breakers.
5. Explore the team size and reporting structure.
6. Ask about leadership and management style — including one honest self-reflection.
7. Cover what the team offers — salary, arrangement, culture, and the real pitch.
8. Ask their one interview question and what has tripped good candidates up before.
9. Close warmly, reflect back what you heard, and explain how DNJ will use this.
10. End your final message with the exact token: [PROFILE_READY]

━━━ RULES ━━━

• Do NOT output [PROFILE_READY] until you have: role/industry, new-vs-replacement, 90-day success definition, what failure at 90 days looks like, historical failure pattern in past candidates, team size, leadership style (including one honest self-reflection), salary range, work arrangement, career growth path, interview stages, work authorization requirements, and at least one screening signal.
• Aim for 14–20 exchanges.
• [PROFILE_READY] must appear at the very end of your final message — nothing after it.
• Do not sound like a form or a robot. Sound like the best hiring conversation they have ever had.
`.trim()

// ── Timing engine (talent mode only) ─────────────────────────────────────────
// Computes career timing signal from DOB + gender without sending any personal
// data to the external AI. Only the resulting advice text is injected.

const CYCLE_DATA: ReadonlyArray<readonly [string, string]> = [
  ['E','W'],['W-','E-'],['W+','W+'],['E-','W-'],['W','E'],
  ['F','G+'],['E+','G-'],['G-','E+'],['G+','F'],
]
const FEB_DAYS: readonly number[] = [
  4,4,5,4,4,4,5,4,4,4, 5,4,4,4,5,4,4,4,5,4,
  4,4,5,4,4,4,5,4,4,4, 5,4,4,4,5,4,4,4,5,4,
  4,4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,4,4,
  4,4,4,4,4,4,4,3,4,4, 4,3,4,4,4,3,4,4,4,3,
  4,4,4,3,4,4,4,3,4,4, 4,3,4,4,4,3,4,4,4,3,
  3,4,4,3,4,4,4,3,4,4, 4,3,4,4,4,3,3,4,4,3,
  4,4,4,3,4,4,4,3,4,4, 4,3,4,4,4,3,4,4,4,3,
  4,4,4,3,4,4,4,3,4,4, 4,
]
const ANCHOR: Record<string, number> = {
  W:2026,'E-':2027,'W+':2028,'W-':2029,E:2030,'G+':2031,'G-':2032,'E+':2033,F:2034,
}

function computeCharacterLocal(dob: string, gender: string): string | null {
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate()
  let sy: number
  if (m < 2) sy = y - 1
  else if (m > 2) sy = y
  else { const b = FEB_DAYS[y - 1950] ?? 4; sy = day < b ? y - 1 : y }
  if (sy < 1950 || sy > 2100) return null
  const slot = (((sy - 1950) % 9) + 9) % 9
  return gender === 'male' ? CYCLE_DATA[slot][0] : CYCLE_DATA[slot][1]
}

function yearLuckStage(character: string, year: number): number {
  const anchor = ANCHOR[character]
  if (!anchor) return 1
  return (((year - anchor) % 9) + 9) % 9 + 1
}

function buildTimingAdvice(stage: number, monthlyBoosted: boolean, peakStatus: 'in' | 'approaching' | 'past' | 'none'): string {
  let base = ''
  if (stage <= 3) {
    base = `The job market right now is going through a lot of uncertainty — global economic headwinds, geopolitical tensions, and quiet restructuring across many industries. The candidates who come out strongest from periods like this are usually those who used the time to deepen their expertise and strengthen their track record in their current role. This is a good year to think about upskilling — a relevant certification, course, or stretch project over the next 12 to 18 months can significantly improve your positioning when the right opportunity appears. That said, if something truly exceptional comes along, there is nothing wrong with exploring it.`
  } else if (stage === 4) {
    base = `You are at an interesting crossroads right now. The market is shifting and there are opportunities, but it rewards people who are deliberate rather than reactive. Do not move just for the sake of moving — the right role is worth waiting for. If an exceptional offer comes, take it. If not, use this period to build leverage in your current role and make sure the right people can see the work you are doing.`
  } else if (stage <= 7) {
    base = `The timing looks genuinely good for a move right now. The market tends to reward people who are proactive during periods like this rather than waiting for roles to find them. I would suggest being intentional about it — identify the 2 or 3 companies or roles you genuinely want and reach out directly rather than waiting for job advertisements to appear. First movers in this kind of market tend to land better.`
  } else {
    base = `This is a decent time to move if you find the right fit — but the market right now favours candidates who are going for a clear step up, not a lateral move. Focus your energy on roles that give you a bigger platform or a meaningful promotion rather than just a change of scenery. The right move now will compound well over the next few years.`
  }

  const boostLine = monthlyBoosted
    ? ` And this month in particular seems to be an active window for candidates with your background in the market — worth putting your feelers out sooner rather than waiting.`
    : ''

  let peakLine = ''
  if (peakStatus === 'in') {
    peakLine = ` You are in a strong performance phase right now — make sure the right people can see the quality of your work. This is not a time to stay invisible.`
  } else if (peakStatus === 'past') {
    peakLine = ` You have built a solid experience base. The key now is to find a platform that lets you lead and leverage what you have built — not just execute.`
  }

  return base + boostLine + peakLine
}

// ── Handler ───────────────────────────────────────────────────────────────────

interface Message { role: 'user' | 'assistant'; content: string }
interface Body { messages?: Message[]; mode?: 'talent' | 'hm'; dob?: string; gender?: string }

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

  // Build timing advice for talent mode when DOB + gender are provided.
  // DOB is used only for local computation — never forwarded to the AI provider.
  let timingBlock = ''
  if (body.mode !== 'hm' && body.dob && body.gender) {
    try {
      const char = computeCharacterLocal(body.dob, body.gender)
      if (char) {
        const currentYear = new Date().getUTCFullYear()
        const stage = yearLuckStage(char, currentYear)

        // Monthly boost check via DB (service-role context available in Edge Function).
        const { adminClient } = await import('../_shared/supabase.ts')
        const db = adminClient()
        const currentMonthFirst = `${currentYear}-${String(new Date().getUTCMonth() + 1).padStart(2,'0')}-01`
        const { data: boostedChars } = await db.rpc('get_monthly_boost_characters', { p_month: currentMonthFirst })
        const monthlyBoosted = Array.isArray(boostedChars) && boostedChars.includes(char)

        // Peak age status.
        const dobDate = new Date(body.dob)
        const ageNow = currentYear - dobDate.getUTCFullYear()
        const { data: peakRaw } = await db.rpc('get_peak_age_score', {
          p_dob: body.dob, p_character: char,
          p_born_day: dobDate.getUTCDate(), p_uses_lunar: false,
        })
        const peakScore = typeof peakRaw === 'number' ? peakRaw : null
        // Determine if peak is in the future by checking if their age is below typical windows.
        // Peak window varies by character — if score=0 and age<30, they're approaching; if >35, past.
        const peakStatus: 'in' | 'approaching' | 'past' | 'none' =
          peakScore === 100 ? 'in'
          : peakScore === 0 && ageNow < 30 ? 'approaching'
          : peakScore === 0 && ageNow >= 30 ? 'past'
          : 'none'

        const advice = buildTimingAdvice(stage, monthlyBoosted, peakStatus)
        timingBlock = `

━━━ CLOSING ADVICE CONTEXT (private — use this to shape your closing only) ━━━

When you reach the closing message (just before [PROFILE_READY]), weave the following career timing perspective naturally into your closing. Do NOT quote it verbatim — rephrase it in your own warm, conversational tone as if it is your genuine career advice. Never mention cycles, stages, frameworks, BaZi, metaphysics, or any scoring system. Frame everything as real-world career strategy and market observation.

Advice to weave in:
${advice}

Blend this naturally with your personalised summary of what you heard from them. The closing should feel like thoughtful, human career advice — not a copy-paste paragraph.`
      }
    } catch { /* timing is best-effort — never block the chat */ }
  }

  const systemPrompt = (body.mode === 'hm' ? HM_PROMPT : TALENT_PROMPT) + timingBlock

  // Provider chain: Groq-1 → Groq-2 → Groq-3 → Anthropic → OpenRouter
  // Add keys as Supabase secrets; any subset works — chain skips missing/failed providers.
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const groqKey = Deno.env.get('GROQ_API_KEY')
  const groqKey2 = Deno.env.get('GROQ_API_KEY_2')
  const groqKey3 = Deno.env.get('GROQ_API_KEY_3')
  const groqKey4 = Deno.env.get('GROQ_API_KEY_4')
  const groqKey5 = Deno.env.get('GROQ_API_KEY_5')
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')

  // ── 1. Groq primary ───────────────────────────────────────────────────────
  if (groqKey) {
    const res = await tryOpenAICompatible(
      'https://api.groq.com/openai/v1/chat/completions',
      `Bearer ${groqKey}`,
      'llama-3.3-70b-versatile',
      'Groq-1',
    )
    if (res) return res
  }

  // ── 2. Groq secondary ────────────────────────────────────────────────────
  if (groqKey2) {
    const res = await tryOpenAICompatible(
      'https://api.groq.com/openai/v1/chat/completions',
      `Bearer ${groqKey2}`,
      'llama-3.3-70b-versatile',
      'Groq-2',
    )
    if (res) return res
  }

  // ── 3. Groq tertiary ─────────────────────────────────────────────────────
  if (groqKey3) {
    const res = await tryOpenAICompatible(
      'https://api.groq.com/openai/v1/chat/completions',
      `Bearer ${groqKey3}`,
      'llama-3.3-70b-versatile',
      'Groq-3',
    )
    if (res) return res
  }

  // ── 4. Groq key 4 ────────────────────────────────────────────────────────
  if (groqKey4) {
    const res = await tryOpenAICompatible(
      'https://api.groq.com/openai/v1/chat/completions',
      `Bearer ${groqKey4}`,
      'llama-3.3-70b-versatile',
      'Groq-4',
    )
    if (res) return res
  }

  // ── 5. Groq key 5 ────────────────────────────────────────────────────────
  if (groqKey5) {
    const res = await tryOpenAICompatible(
      'https://api.groq.com/openai/v1/chat/completions',
      `Bearer ${groqKey5}`,
      'llama-3.3-70b-versatile',
      'Groq-5',
    )
    if (res) return res
  }

  // ── 6. Anthropic (Claude Sonnet) — backup ─────────────────────────────────
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
          model: 'claude-sonnet-4-6',
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

  // ── Helper: stream an OpenAI-compatible provider (Groq / OpenRouter) ──────
  async function tryOpenAICompatible(
    url: string,
    authHeader: string,
    model: string,
    label: string,
  ): Promise<Response | null> {
    const msgs = [{ role: 'system', content: systemPrompt }, ...messages]
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 28_000)
    let upstream: Response
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ model, max_tokens: 512, stream: true, messages: msgs }),
        signal: ac.signal,
      })
      clearTimeout(t)
    } catch (e) {
      clearTimeout(t)
      console.error(`${label} fetch failed/timed out:`, e)
      return null
    }
    if (!upstream.ok) {
      console.error(`${label} error:`, upstream.status)
      return null
    }
    // Rewrite OpenAI SSE → Anthropic content_block_delta format so the client parser works unchanged.
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()
    const decoder = new TextDecoder();
    (async () => {
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



  // ── 4. OpenRouter (free tier — no credit card required) ───────────────────
  // Sign up at openrouter.ai, copy API key, set as OPENROUTER_API_KEY secret.
  if (openrouterKey) {
    const res = await tryOpenAICompatible(
      'https://openrouter.ai/api/v1/chat/completions',
      `Bearer ${openrouterKey}`,
      'meta-llama/llama-3.3-70b-instruct:free',
      'OpenRouter',
    )
    if (res) return res
  }

  return new Response(JSON.stringify({ error: 'No AI provider available. Set ANTHROPIC_API_KEY, GROQ_API_KEY, GROQ_API_KEY_2, or OPENROUTER_API_KEY as Supabase secrets.' }), {
    status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
