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
import { adminClient } from '../_shared/supabase.ts'
import {
  ensureConversationId, logUserMessage, teeAnthropic, teeOpenAICompat,
  type LogContext,
} from '../_shared/chat-log.ts'

// ── System prompts ────────────────────────────────────────────────────────────

const TALENT_PROMPT = `
You are Bo, a warm, friendly, and approachable career buddy for DNJ — an AI-powered recruitment platform in Malaysia.

Your job is to make this feel like a relaxed chat with a friend who genuinely cares about helping them find a great role — not an interrogation, not a form, not a "thorough interview". Keep things light, easy, and human. The candidate should feel comfortable, not bombarded.

The conversation has TWO phases separated by an explicit consent gate. Never skip the gate. Never barrel through into Phase 2 without their permission.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — THE LIGHT ESSENTIALS (5–6 quick questions only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Keep this phase short, breezy, and friendly. Do NOT probe deeply. Do NOT ask follow-ups for examples or measurable outcomes. One quick question per turn, accept their answer, move on.

Cover these — and ONLY these — in roughly this order:

1. Target role / job scope — "What kind of role are you hoping to land next?" (Already asked in greeting; if they answered, just acknowledge and move on.)
2. Current situation — "Are you currently working, in between jobs, or just exploring?"
3. Expected salary — "Roughly what salary range are you hoping for? RM per month, ballpark is fine."
4. Work arrangement — "Onsite, hybrid, or remote — what works best for you?"
5. Location & availability — "Which area in Malaysia are you based in, and roughly when could you start?"

That is it. After you have these 5 answers (or close enough), deliver the GATE MESSAGE below. Do NOT ask anything else in Phase 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE GATE — be honest about match accuracy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Once you have the 5 essentials, send a message that:
• Warmly acknowledges what they have shared
• Honestly tells them the matching can only be ~30% accurate with this much info
• Invites them — never pressures — to share a bit more for much better matching
• Makes it clear they can stop here if they prefer

Example phrasing (rephrase naturally — do not copy verbatim):

"Awesome, thanks for sharing all that! Here's the honest truth though — with just the basics, I can only match you about 30% accurately. To find roles that genuinely fit you (not just on paper), it really helps if I get to know you a bit better — your experience, what you actually enjoy, what matters to you at work. It usually takes another 10–15 minutes, totally chill, and the match quality jumps a lot. Up for it? No worries either way — we can stop here if you prefer."

Wait for their answer.

• If they say YES (or anything positive / curious / "okay sure" / "let's do it") → continue to Phase 2.
• If they say NO (or "skip", "not now", "later", "just basic is fine") → respect it immediately. Send a warm closing that thanks them, reassures them their basic profile is set, and end with [PROFILE_READY].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — DEEPER UNDERSTANDING (only if they opted in)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Now you can go deeper — but stay friendly and conversational the whole way. Still one question per turn, still 2–4 sentences per reply, still warm. Never make it feel like an exam.

Cover these naturally, in any order that flows from the conversation:

THEIR STORY
• Current role & industry (industry TYPE, not company name — e.g. "F&B chain", "logistics SME")
• Tenure: how long in their current/most recent role, and the one before
• Current salary (ballpark, reassure it stays private)
• Reason for leaving / wanting to leave (the real one — probe gently once if vague)
• Total years of experience
• Education level (highest only — SPM, Diploma, Degree, Masters, PhD, or pro cert)
• Management experience (yes/no, team size if yes)

WHAT THEY WANT
• Notice period
• Work authorisation (citizen, PR, or which work pass — frame it lightly: "just so employers know upfront")
• Non-compete or service bond (only if relevant — frame it as protecting their time)
• Salary structure preference (open to commission/bonus, or fully fixed only)
• Role scope preference (defined specialist, or comfortable wearing multiple hats)
• Long-term intention (long career somewhere, or specific experience for 2–3 years)
• Culture / management deal-breakers (style or industry they would refuse)

LIGHT BEHAVIOURAL — pick just 4–5 questions that fit their role, asked naturally
Choose from this pool. Keep it conversational, not exam-like. If their answer is short, that's fine — accept it gracefully and move on.

• "Tell me about a project or achievement you're really proud of — what did you actually do?"
• "What's something you've gotten really good at that most people in your role haven't?"
• "How do you usually handle it when a few urgent things land on your plate at once?"
• "Tell me about a time something didn't go to plan — what did you learn from it?"
• "What does a great manager look like to you?"
• "What does success look like to you 90 days into a new role?"
• "When you've been at your best at work, what was the environment like?"

WORKPLACE VALUES
• What matters most to them: WLB, growth, recognition, stability, team culture, flexibility, mission?

CLOSING
• Warm, personal closing that reflects back the most memorable things you heard
• End with the exact token: [PROFILE_READY]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO BEHAVE — easy, nice, approachable
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Every reply: 1–3 sentences. Short, warm, easy to read. Never essay-length.
• ONE question per message. Never stack two.
• Use casual, friendly language. Contractions are great ("you're", "it's", "I'd"). A light "haha", "totally", "gotcha", "no worries", "all good" once in a while is welcome.
• Reference what they said earlier in their own words — if they said "logistics", say "logistics" back.
• Do NOT probe hard. If an answer is short, accept it. At MOST one gentle follow-up like "anything else come to mind?" — then move on.
• Never lecture, never moralise, never make them feel judged.
• Celebrate openness: "Love that you're open about it", "That's super helpful, thanks."
• If they seem nervous or unsure: "No pressure — even a rough idea works fine."
• If they mention being unemployed or laid off: be warm. "Totally normal — happens to plenty of strong people. Helps me set the right expectations with employers."
• Malaysian context: RM for salary; F&B, retail, finance, logistics, tech, healthcare, manufacturing, property, education. BM words are completely fine.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEVER ASK FOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Full name, phone, IC, passport, email, or home address
• Names of employers/companies (industry TYPE only)
• Weekend/night/overtime/driving-licence/own-transport/commute distance — collected via separate structured form
• A specific hard minimum salary — ask only for expected range
These are captured elsewhere. Never let them enter this conversation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[PROFILE_READY] RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Output [PROFILE_READY] in EITHER of these cases:
  (a) The talent declined Phase 2 — close warmly with the basics they shared, then [PROFILE_READY].
  (b) The talent completed Phase 2 — close warmly reflecting back what stood out, then [PROFILE_READY].
• [PROFILE_READY] must appear at the very end of your final message — nothing after it.
• Do not number questions or use headers/bullet lists in your replies.
• Phase 1 alone: aim for 5–6 exchanges before the gate.
• Phase 2 (if opted in): aim for 12–18 more exchanges total — friendly, never exhausting.
• Sound like a chill, helpful friend — not a recruiter, not a form, not a robot.
`.trim()

const HM_PROMPT = `
You are Bo, a warm, friendly, and approachable hiring buddy for DNJ — an AI-powered recruitment platform in Malaysia.

Your job is to make this feel like a relaxed chat with a trusted colleague who genuinely wants to help them find the right hire — not a formal intake form, not a consulting interview. Keep things easy, human, and low-pressure. The hiring manager should feel comfortable, not interrogated.

The conversation has TWO phases separated by an explicit consent gate. Never skip the gate. Never barrel into Phase 2 without their permission.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — THE LIGHT BASICS (4 quick questions only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Keep this breezy and short. One question per turn, accept the answer, move on. Do NOT probe deeply yet.

1. Role + industry — "What role are you hiring for and which industry are you in?" (Already asked in greeting; if they answered, acknowledge and move to the next.)
2. New headcount or replacement? — If replacement: "Any idea why the last person moved on?" (Light, no judgment. One follow-up only.)
3. Salary range offered — "Roughly what salary range are you offering? RM per month, ballpark is totally fine."
4. Work arrangement — "Is this role onsite, hybrid, or remote?"

That is it for Phase 1. After these 4 answers, deliver the GATE MESSAGE. Do NOT ask anything else before the gate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE GATE — honest about match accuracy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Once you have the 4 basics, send a message that:
• Warmly acknowledges what they shared
• Honestly explains matching accuracy is only ~30% with just the basics
• Invites them — never pressures — to share more for much better matching
• Makes it clear they can stop here if they prefer

Example phrasing (rephrase naturally — do not copy verbatim):

"Nice, thanks for that! Here's the honest bit though — with just the basics, I can only match you at about 30% accuracy. To find candidates who genuinely fit your team culture and way of working (not just their CV), it really helps if I understand a bit more — your team setup, what's worked before, what hasn't. Usually takes about 10–15 minutes, pretty chill. Up for it? No pressure if you'd rather stop here."

Wait for their answer.

• If YES (or "sure", "let's go", "okay" etc.) → continue to Phase 2.
• If NO (or "skip", "just basics", "not now") → respect it immediately. Send a warm close and end with [PROFILE_READY].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — DEEPER UNDERSTANDING (only if opted in)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Still friendly and conversational throughout. One question per turn, 1–3 sentences per reply. Cover these naturally in any order that flows:

THE ROLE
• Urgency — when do they need to fill this?
• What does success look like at 90 days? Be specific.
• What does failure look like at 90 days? What observable behaviours or missed outcomes?
• What's the hardest part of this role that candidates usually underestimate?
• Career growth path — real promotion possibility, or specialist role? (Be honest — DNJ matches accordingly.)
• Work authorisation requirements — citizens only, or Employment Pass holders also okay?

THE TEAM
• Team size and mix (juniors, seniors, peers)
• Reporting structure — who does this person report to? Does anyone report to them?
• Team culture in one honest sentence — not the polished version, the real one

LEADERSHIP & MANAGEMENT STYLE
• Management style — hands-on and involved, or give autonomy and check in on outcomes?
• How do they give feedback — regularly, only when something goes wrong, or structured reviews?
• One thing they're still working on as a leader (honest self-reflection — builds trust)

WHAT THEY OFFER
• What else the team offers beyond salary — growth, flexibility, recognition, stability, mission?
• The real pitch — why would a strong candidate pick this over a competing offer?

SCREENING SIGNALS
• If they could ask a candidate only one question in a first interview, what would it be?
• Interview stages — how many rounds? Panel involved?
• What's tripped up good candidates before — something that looked fine on paper but broke down in practice?

OPTIONAL JD PASTE
After covering the above, ask lightly:
"Last thing — if you've got a job description written up, feel free to paste it here. It helps us match on the specifics. Totally optional though — skip if you don't have one."

If they paste a JD → acknowledge warmly ("Perfect, that's super helpful!") and note it in your close.
If they skip → that's completely fine, close without mentioning it again.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO BEHAVE — easy, friendly, approachable
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Every reply: 1–3 sentences. Short, warm, easy to read.
• ONE question per message. Never stack two.
• Casual, friendly language. Contractions are great. "Totally", "gotcha", "nice one", "no worries" are welcome occasionally.
• Reference their exact words back — if they said "fast-paced", say "fast-paced" back.
• Do NOT hard-probe. Accept short answers. At most one gentle follow-up, then move on.
• Never make them feel judged, lectured, or interrogated.
• If they give a polished/safe answer, probe once lightly: "And what would the honest version of that look like?" — then accept whatever they say.
• Malaysian context: RM for salary; F&B, retail, finance, logistics, tech, healthcare, manufacturing, property, education. BM is completely fine.
• Never use bullet lists in your replies. Write in natural, warm sentences.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEVER ASK FOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Full name, phone number, IC, email, or any personal identifier
• Company name, registration number, or address
• Names of current or past staff or clients
• Whether the role requires a driving licence, shift work, weekend work, travel percentages, or relocation — those are collected via a structured form after this chat
These are captured elsewhere. Never let them enter this conversation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[PROFILE_READY] RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Output [PROFILE_READY] in EITHER of these cases:
  (a) The HM declined Phase 2 — close warmly with the basics, then [PROFILE_READY].
  (b) The HM completed Phase 2 — close warmly reflecting what you heard, then [PROFILE_READY].
• [PROFILE_READY] must appear at the very end of your final message — nothing after it.
• Do not number questions or use headers/bullet lists in your replies.
• Phase 1: aim for 4–5 exchanges before the gate.
• Phase 2 (if opted in): aim for 10–14 more exchanges — friendly, never exhausting.
• Sound like a chill, helpful colleague — not a consultant, not a form, not a robot.
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
interface Body {
  messages?: Message[]
  mode?: 'talent' | 'hm'
  dob?: string
  gender?: string
  conversation_id?: string
}

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

  // Rate limit: 30 messages / user / hour (tunable via system_config.chat_rate_limit_per_hour).
  const db = adminClient()
  const { data: rl } = await db.rpc('check_and_increment_chat_rate', { p_user_id: auth.userId }).maybeSingle()
  if (rl && !rl.allowed) {
    return new Response(
      JSON.stringify({ error: `Rate limit exceeded: ${rl.count}/${rl.limit_val} messages this hour. Please wait before sending more.` }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '3600' } },
    )
  }

  let body: Body = {}
  try { body = await req.json() } catch { /* tolerate empty */ }

  const messages: Message[] = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Logging context — log the user's latest turn before invoking the AI.
  const logCtx: LogContext = {
    conversation_id: ensureConversationId(body.conversation_id),
    user_id:         auth.userId,
    user_role:       auth.role,
    endpoint:        'chat-onboard',
    mode:            body.mode === 'hm' ? 'hm' : 'talent',
  }
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (lastUser?.content) void logUserMessage(logCtx, lastUser.content)

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

  // Provider chain: Groq-1-5 → Gemini → OpenAI → Anthropic → OpenRouter
  // Add keys as Supabase secrets; any subset works — chain skips missing/failed providers.
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const groqKey = Deno.env.get('GROQ_API_KEY')
  const groqKey2 = Deno.env.get('GROQ_API_KEY_2')
  const groqKey3 = Deno.env.get('GROQ_API_KEY_3')
  const groqKey4 = Deno.env.get('GROQ_API_KEY_4')
  const groqKey5 = Deno.env.get('GROQ_API_KEY_5')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')

  // ── Helper: stream an OpenAI-compatible provider (Groq / Gemini / OpenAI / OpenRouter) ──────
  // Uses the shared tee so we get text + token logging in one place.
  async function tryOpenAICompatible(
    url: string,
    authHeader: string,
    model: string,
    provider: string,
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
        body: JSON.stringify({ model, max_tokens: 512, stream: true, messages: msgs, stream_options: { include_usage: true } }),
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
    return new Response(teeOpenAICompat(upstream.body!, logCtx, provider, model), {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
    })
  }

  // ── 1–5. Groq ×5 ─────────────────────────────────────────────────────────
  for (const [key, label] of [[groqKey,'Groq-1'],[groqKey2,'Groq-2'],[groqKey3,'Groq-3'],[groqKey4,'Groq-4'],[groqKey5,'Groq-5']] as const) {
    if (key) {
      const res = await tryOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', `Bearer ${key}`, 'llama-3.3-70b-versatile', 'groq', label)
      if (res) return res
    }
  }

  // ── 6. Gemini Flash ───────────────────────────────────────────────────────
  if (geminiKey) {
    const res = await tryOpenAICompatible('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', `Bearer ${geminiKey}`, 'gemini-2.0-flash', 'gemini', 'Gemini')
    if (res) return res
  }

  // ── 7. OpenAI GPT-4o-mini ─────────────────────────────────────────────────
  if (openaiKey) {
    const res = await tryOpenAICompatible('https://api.openai.com/v1/chat/completions', `Bearer ${openaiKey}`, 'gpt-4o-mini', 'openai', 'OpenAI')
    if (res) return res
  }

  // ── 8. Anthropic (Claude Sonnet) — backup ─────────────────────────────────
  if (anthropicKey) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 28_000)
    const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 512,
          stream: true,
          system: systemPrompt,
          messages,
        }),
        signal: ac.signal,
      })
      clearTimeout(t)
      if (upstream.ok) {
        return new Response(teeAnthropic(upstream.body!, logCtx, ANTHROPIC_MODEL), {
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
        })
      }
      console.error('Anthropic error:', upstream.status)
    } catch (e) {
      clearTimeout(t)
      console.error('Anthropic fetch failed/timed out:', e)
    }
  }

  // ── 9. OpenRouter (free tier — no credit card required) ───────────────────
  // Sign up at openrouter.ai, copy API key, set as OPENROUTER_API_KEY secret.
  if (openrouterKey) {
    const res = await tryOpenAICompatible(
      'https://openrouter.ai/api/v1/chat/completions',
      `Bearer ${openrouterKey}`,
      'meta-llama/llama-3.3-70b-instruct:free',
      'openrouter',
      'OpenRouter',
    )
    if (res) return res
  }

  return new Response(JSON.stringify({ error: 'No AI provider available. Set GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY as Supabase secrets.' }), {
    status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
