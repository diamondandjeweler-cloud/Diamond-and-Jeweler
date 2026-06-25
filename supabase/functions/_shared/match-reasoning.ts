/**
 * match-reasoning.ts — pure, dependency-free reasoning/phrasing layer for the
 * matcher, extracted verbatim from match-core.ts.
 *
 * WHY A SEPARATE FILE: match-core.ts imports ./supabase.ts (Deno + network
 * deps), which makes the whole module impossible to import from a Node/vitest
 * unit test. This file has ZERO Deno or Supabase imports, so the user-facing
 * reasoning copy — and its secrecy invariant — can be unit-tested. match-core.ts
 * imports buildPublicReasoning from here; behaviour is identical to before split.
 *
 * SECRECY INVARIANT (pinned by match-reasoning.test.ts): the strings produced
 * here are shown to hiring managers and must NEVER surface the proprietary
 * compatibility model's vocabulary (BaZi / life-chart / fortune / character
 * bucket). The v2 team-dynamic branch is deliberately generic.
 */

/**
 * Structural subset of match-core's ScoredCandidate — exactly the fields the
 * reasoning builder reads. A full ScoredCandidate is assignable to this, so the
 * single call site in match-core.ts (buildPublicReasoning(scored, …)) stays
 * unchanged and type-safe.
 */
export interface ReasoningCandidate {
  talent_id: string
  tagComp: number
  cultureComparison: { talent_top_wants: string[]; hm_top_offers: string[]; overlap: string[]; talent_only: string[]; hm_only: string[]; labels: Record<string, string> }
  ageScore: number | null
  locationScore: number | null
  backgroundScore: number
  behavioralFitness: number | null
  salaryFit: number | null
  employmentFit: number | null
  feedbackScore: number | null
  experienceFit: number | null
  educationFit: number | null
  careerGoalFit: number | null
  jobIntentionFit: number | null
  talentShortestTenure: number | null
  talentRedFlagsCount: number
  finalScore: number
  ghostScore: number
  ghostThreshold: number
  cultureDataSource: string
  activeWindowBoth: boolean
  talentNeedsRamp: boolean
  mustHaveItems: string[]
  dealBreakerItems: string[]
  talentBehavioralTags: Record<string, number | null>
  monthlyBoostScore: number
  characterBucket: string | null
  reasoning: { talent_tag_overlap: Record<string, number>; weight_sum: number }
}

// ── Helper: build public reasoning for HM ────────────────────────────────────
//
// Each candidate-facing sentence is picked from a small pool of paraphrases so
// cards don't read identically. Picks are deterministic per (talent, role)
// pair — same candidate always shows the same wording on refresh, but two
// candidates that hit the same signal will read differently. Hash is FNV-1a
// over `${talentId}|${roleId}|${key}` which is plenty for ~6-way selection.

function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

function pick<T>(arr: readonly T[], seed: string, key: string): T {
  return arr[fnv1a(`${seed}|${key}`) % arr.length]
}

// ── Phrase pools (rotated per candidate via deterministic seed) ──────────────

const POOL_TRAIT_OVERLAP = [
  (m: number, t: number) => `Strong overlap on ${m}/${t} required traits.`,
  (m: number, t: number) => `${m} of the ${t} traits you listed show up clearly in their profile.`,
  (m: number, t: number) => `Hits ${m}/${t} of your required-trait checklist.`,
  (m: number, t: number) => `Profile aligns on ${m}/${t} of the must-have traits for this role.`,
  (m: number, t: number) => `${m} out of ${t} required traits are evidenced in their history.`,
  (m: number, t: number) => `Demonstrates ${m}/${t} of the traits you marked as required.`,
] as const

const POOL_SKILLS_STRONG = [
  'Skills profile fits the role above the strong-match threshold.',
  'Their skill set comfortably clears our strong-match bar for this role.',
  'Technical fit is high — skill stack closely tracks what the role needs.',
  'Skills overlap is well above the level we flag as a confident match.',
  'A clear skill-stack match — most role-critical capabilities are covered.',
  'Their working skill set is a strong technical fit for this brief.',
] as const

const POOL_SKILLS_MODERATE = [
  'Skills overlap is moderate — interview should probe gaps.',
  'Mid-level skill match. Use the first call to map the specific gaps.',
  'Their skill stack partially covers the role — clarify the missing pieces in interview.',
  'Skills are partially aligned; structured probing will tell you whether the gap is bridgeable.',
  'Moderate technical fit — interview should pin down which capabilities are real vs. claimed.',
] as const

const POOL_SKILLS_LOW = [
  'Skills overlap is low — fit will rely on adjacent strengths.',
  'Direct skill match is limited. Decision will hinge on transferable strengths.',
  'Few of the core skills are evidenced — consider whether their adjacent experience compensates.',
  'Low direct skill match; worth a call only if their other signals are unusually strong.',
] as const

const POOL_CULTURE_STRONG = [
  'Strong culture alignment — talent and team share most key priorities.',
  'Culture signals line up well — overlap on most of the priorities you flagged.',
  "Their stated workplace values map closely to your team's culture.",
  'Talent and team agree on most of the cultural priorities that matter for this role.',
] as const

const POOL_CULTURE_NONE = [
  'No direct culture overlap detected — discuss team environment and expectations in the interview.',
  "Their cultural priorities don't visibly overlap with your team's. Worth a candid conversation early.",
  "We didn't find shared culture signals — surface working-style expectations in the first call.",
] as const

const POOL_SALARY_STRONG = [
  'Salary expectation aligns well with the role offer.',
  "Their expected range comfortably fits your role's budget.",
  'Compensation expectations are well-matched — no negotiation friction expected here.',
  "Salary fit is clean — what they're asking for sits inside what the role offers.",
] as const

const POOL_SALARY_MID = [
  'Salary expectation is slightly above the offer range — confirm budget in first call.',
  "Their ask is a touch above the role's stated band. Worth flagging on the first call.",
  'Modest salary gap above your offer range — clarify whether either side has flex.',
] as const

const POOL_SALARY_LOW = [
  'Significant salary gap — candidate expects considerably more than the role offers. Clarify early.',
  "Compensation gap is meaningful — talent's expectation runs well over your range. Clarify before investing interview time.",
  "Material salary mismatch. The talent's number is well above the role's offer — address this in the first conversation.",
] as const

const POOL_BEHAVIOR_STRONG = [
  (n: number) => `Strong behavioural profile overall (${n}/100 from interview assessment).`,
  (n: number) => `Behavioural assessment is strong — overall score ${n}/100.`,
  (n: number) => `Solid behavioural baseline (${n}/100 across our assessment dimensions).`,
  (n: number) => `Came out strong in behavioural signals (${n}/100 composite).`,
] as const

const POOL_BEHAVIOR_MIXED = [
  (n: number) => `Behavioural interview signals are mixed (${n}/100) — structured probing recommended.`,
  (n: number) => `Behavioural assessment came back mixed (${n}/100). Use a structured second-round to clarify.`,
  (n: number) => `Mixed behavioural signals (${n}/100 composite) — worth a structured deep-dive.`,
] as const

const POOL_BACKGROUND_ALIGNED = [
  'Background experience aligns with the role.',
  'Career background lines up well with what the role needs.',
  'Their work history is on-trajectory for this role.',
  'Background and prior roles read as a natural fit for this brief.',
] as const

const POOL_BACKGROUND_OFF_FIELD = [
  'Off-field background — interview should probe motivation and learning curve.',
  'Background sits outside your usual hiring lane — probe the why and the ramp.',
  "Their prior field isn't a direct match — explore motivation and how quickly they could ramp.",
] as const

const POOL_EXPERIENCE_STRONG = [
  'Years of experience matches role seniority level.',
  'Tenure depth is right for the seniority you posted.',
  'Their experience level lines up cleanly with how senior the role is.',
  'Years-in-field track the seniority bar you set.',
] as const

const POOL_EXPERIENCE_MID = [
  'Experience level is slightly mismatched — confirm scope expectations in interview.',
  'Small experience mismatch — sanity-check the scope expectations on a first call.',
  "Their seniority isn't a perfect match — clarify scope on the call.",
] as const

const POOL_EXPERIENCE_LOW = [
  'Noticeable experience gap — candidate may be over or underqualified. Probe role fit explicitly.',
  "Experience gap is noticeable — they may be over- or underqualified. Don't assume; ask.",
  'Material experience mismatch — explicitly check whether the role would stretch or under-use them.',
] as const

const POOL_EXPERIENCE_VERY_LOW = [
  'Significant experience mismatch — validate whether candidate can meet role demands or will be unchallenged.',
  'Large experience mismatch. Decide whether the role would over-stretch them, or fail to hold their interest.',
  'Experience level is far from the role bar — validate this is the right fit before committing time.',
] as const

const POOL_CAREER_GOAL_MISMATCH = [
  'Career goal may not align with what this role offers — clarify growth expectations and promotion path in the interview.',
  "Their stated career direction doesn't obviously match what this role offers — talk through growth and promotion path.",
  'Career goal alignment is unclear — surface their next-3-year plan and your promotion path on the call.',
] as const

const POOL_CAREER_GOAL_STRONG = [
  'Career direction aligns well with what this role offers.',
  "The role's trajectory matches the next chapter they're aiming for.",
  "Their career direction maps cleanly onto where this role can take them.",
] as const

const POOL_JOB_INTENTION_SHORT = [
  'Candidate indicated they are looking to gain specific experience before moving on — confirm long-term commitment expectations early.',
  "They've signalled this role would be a stepping-stone — set long-term expectations early.",
  "Their intent reads as 'pick up specific experience and move on' — calibrate tenure expectations up front.",
] as const

const POOL_FEEDBACK_HIGH = [
  'Highly rated by previous hiring managers.',
  'Prior hiring managers rated this talent highly.',
  'Strong reputation from previous matches.',
] as const

const POOL_FEEDBACK_LOW = [
  'Lower ratings from previous matches — review interview feedback before proceeding.',
  'Prior HM feedback is below average — review notes before committing to interview slots.',
  'Earlier matches rated them below average — worth reading the feedback first.',
] as const

const POOL_EDU_LOW = [
  'Education level may be below the typical minimum for this role — verify qualifications before shortlisting.',
  "Their education credentials sit below the role's typical bar — verify before shortlisting.",
  'Formal education may be light for this role — confirm equivalencies on the call.',
] as const

const POOL_EMPLOYMENT_TYPE = [
  'Employment type preference may not match this role — confirm during screening.',
  "Their preferred employment type doesn't obviously match this role — confirm on the screening call.",
  'Employment-type fit is uncertain (contract vs. full-time, etc.) — clarify early.',
] as const

const POOL_CULTURE_AI = [
  'Culture signals are self-reported via AI onboarding — treat as indicative, not verified. Confirm values and working style in the interview.',
  'Culture signals come from their AI onboarding — useful as a directional read, but verify in interview.',
  'These culture signals are self-reported during onboarding; treat as indicative until confirmed face-to-face.',
] as const

// ── End phrase pools ─────────────────────────────────────────────────────────

export function buildPublicReasoning(s: ReasoningCandidate, roleTraits: string[], useDiversityV2 = false, roleId = '') {
  const seed = `${s.talent_id}|${roleId}`
  const overlap = s.reasoning.talent_tag_overlap ?? {}
  const matchedTraits = Object.keys(overlap)
  const missingTraits = roleTraits.filter((t) => !matchedTraits.includes(t))
  const strengths: string[] = []
  const watchouts: string[] = []

  if (matchedTraits.length > 0) strengths.push(pick(POOL_TRAIT_OVERLAP, seed, 'trait_overlap')(matchedTraits.length, roleTraits.length))
  if (s.tagComp >= 70) strengths.push(pick(POOL_SKILLS_STRONG, seed, 'skills_strong'))
  else if (s.tagComp >= 40) watchouts.push(pick(POOL_SKILLS_MODERATE, seed, 'skills_moderate'))
  else watchouts.push(pick(POOL_SKILLS_LOW, seed, 'skills_low'))

  const cc = s.cultureComparison
  if (cc.overlap.length >= 3) strengths.push(pick(POOL_CULTURE_STRONG, seed, 'culture_strong'))
  else if (cc.overlap.length === 0 && cc.talent_top_wants.length > 0) watchouts.push(pick(POOL_CULTURE_NONE, seed, 'culture_none'))

  if (s.salaryFit != null) {
    if (s.salaryFit >= 90) strengths.push(pick(POOL_SALARY_STRONG, seed, 'salary_strong'))
    else if (s.salaryFit >= 60) watchouts.push(pick(POOL_SALARY_MID, seed, 'salary_mid'))
    else if (s.salaryFit < 40) watchouts.push(pick(POOL_SALARY_LOW, seed, 'salary_low'))
  }
  if (s.employmentFit != null && s.employmentFit < 60) {
    watchouts.push(pick(POOL_EMPLOYMENT_TYPE, seed, 'employment_type'))
  }
  if (s.behavioralFitness != null) {
    if (s.behavioralFitness >= 75) strengths.push(pick(POOL_BEHAVIOR_STRONG, seed, 'behavior_strong')(Math.round(s.behavioralFitness)))
    else if (s.behavioralFitness < 50) watchouts.push(pick(POOL_BEHAVIOR_MIXED, seed, 'behavior_mixed')(Math.round(s.behavioralFitness)))
  }
  if (s.feedbackScore != null) {
    if (s.feedbackScore >= 70) strengths.push(pick(POOL_FEEDBACK_HIGH, seed, 'feedback_high'))
    else if (s.feedbackScore < 40) watchouts.push(pick(POOL_FEEDBACK_LOW, seed, 'feedback_low'))
  }
  if (s.backgroundScore < 50) watchouts.push(pick(POOL_BACKGROUND_OFF_FIELD, seed, 'background_off'))
  else if (s.backgroundScore >= 100) strengths.push(pick(POOL_BACKGROUND_ALIGNED, seed, 'background_aligned'))

  if (s.experienceFit != null) {
    if (s.experienceFit >= 90) strengths.push(pick(POOL_EXPERIENCE_STRONG, seed, 'exp_strong'))
    else if (s.experienceFit >= 60) watchouts.push(pick(POOL_EXPERIENCE_MID, seed, 'exp_mid'))
    else if (s.experienceFit >= 40) watchouts.push(pick(POOL_EXPERIENCE_LOW, seed, 'exp_low'))
    else watchouts.push(pick(POOL_EXPERIENCE_VERY_LOW, seed, 'exp_very_low'))
  }
  if (s.educationFit != null && s.educationFit < 80) {
    watchouts.push(pick(POOL_EDU_LOW, seed, 'edu_low'))
  }
  if (s.careerGoalFit != null && s.careerGoalFit < 50) {
    watchouts.push(pick(POOL_CAREER_GOAL_MISMATCH, seed, 'career_mismatch'))
  } else if (s.careerGoalFit != null && s.careerGoalFit >= 85) {
    strengths.push(pick(POOL_CAREER_GOAL_STRONG, seed, 'career_strong'))
  }
  if (s.jobIntentionFit != null && s.jobIntentionFit < 70) {
    watchouts.push(pick(POOL_JOB_INTENTION_SHORT, seed, 'job_intent_short'))
  }

  let doubtCount = 0
  if (s.tagComp < 40) doubtCount++
  if (s.salaryFit != null && s.salaryFit < 40) doubtCount++
  if (s.behavioralFitness != null && s.behavioralFitness < 40) doubtCount++
  if (s.feedbackScore != null && s.feedbackScore < 30) doubtCount++
  if (s.backgroundScore < 40) doubtCount++
  if (s.careerGoalFit != null && s.careerGoalFit < 40) doubtCount++
  if (s.educationFit != null && s.educationFit < 60) doubtCount++
  if (s.talentRedFlagsCount > 0) doubtCount++
  if (s.talentShortestTenure != null && s.talentShortestTenure < 12) doubtCount++
  if (doubtCount >= 4) {
    watchouts.push(`Platform signals ${doubtCount}/8 evaluation dimensions as uncertain. A wrong hire costs 3+ months' salary plus team morale — a structured second-round interview is strongly recommended before shortlisting.`)
  }
  if (s.ghostScore >= s.ghostThreshold) {
    watchouts.push('This candidate has been slow to respond in previous matches — build extra lead time into your outreach and set a clear response deadline.')
  }
  if (s.cultureDataSource === 'ai_inferred') {
    watchouts.push(pick(POOL_CULTURE_AI, seed, 'culture_ai'))
  }
  if (s.monthlyBoostScore === 100) strengths.push('Favourable-period match — platform signals this month as a strong window for this candidate. Prioritise outreach.')
  if (s.activeWindowBoth) strengths.push('Strong-momentum match — recommend moving quickly while both sides are actively engaged.')
  if (s.talentNeedsRamp) watchouts.push('Likely growth hire — expect a 1–2 year ramp before full performance. Plan onboarding and mentorship accordingly.')
  if (s.ageScore != null && s.ageScore < 50) watchouts.push('Reporting-line age dynamic to consider.')
  if (s.locationScore != null && s.locationScore < 40) watchouts.push('Commute distance may be a factor — confirm during interview.')
  if (missingTraits.length > 0) watchouts.push(`Trait gaps to discuss: ${missingTraits.slice(0, 4).join(', ')}.`)

  const bt = s.talentBehavioralTags ?? {}
  const BEHAVIORAL_LABELS: Record<string, string> = {
    ownership: 'personal accountability', communication_clarity: 'communication clarity',
    emotional_maturity: 'emotional maturity', problem_solving: 'problem-solving logic',
    resilience: 'resilience under failure', results_orientation: 'results orientation',
    professional_attitude: 'professional attitude', confidence: 'confident self-presentation',
    coachability: 'coachability',
  }
  const strongBehavior: string[] = []
  const weakBehavior: string[] = []
  for (const [key, label] of Object.entries(BEHAVIORAL_LABELS)) {
    const score = bt[key]
    if (score == null) continue
    if (score >= 0.75) strongBehavior.push(label)
    else if (score <= 0.35) weakBehavior.push(label)
  }
  if (strongBehavior.length > 0) strengths.push(`Behavioural interview signals strong ${strongBehavior.slice(0, 3).join(', ')}.`)
  if (weakBehavior.length > 0) watchouts.push(`Interview showed weak signals on: ${weakBehavior.slice(0, 3).join(', ')} — probe these.`)
  if (s.mustHaveItems.length > 0) watchouts.push(`Verify HM's non-negotiables in interview: ${s.mustHaveItems.slice(0, 3).join('; ')}.`)
  if (s.dealBreakerItems.length > 0) watchouts.push(`Talent's non-negotiables (must be honoured): ${s.dealBreakerItems.slice(0, 3).join('; ')}.`)

  // Team-dynamic compatibility sentence (v2 only). Wording is intentionally
  // generic — never references the underlying compatibility model.
  if (useDiversityV2 && s.characterBucket) {
    if (s.characterBucket === 'bad') {
      watchouts.push(
        "This candidate's qualifications strongly match your role, but our team-dynamic compatibility analysis suggests the working-style fit with your existing team may need extra attention. Worth a deeper conversation on collaboration style and team dynamics during the interview.",
      )
    } else {
      strengths.push(
        "Based on our team-dynamic compatibility analysis, this candidate is likely to integrate smoothly with your existing team's working style.",
      )
    }
  }

  return {
    score_band: s.finalScore >= 75 ? 'strong' : s.finalScore >= 50 ? 'good' : 'cautious',
    strengths, watchouts, matched_traits: matchedTraits, missing_traits: missingTraits,
    behavioral_tags: bt, culture_comparison: s.cultureComparison,
    note: 'This explanation summarises platform signals. Final hiring decisions remain yours.',
  }
}
