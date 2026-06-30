/**
 * match-scoring.ts — the PURE final-score composition for the matcher.
 *
 * Extracted byte-for-byte from `scoreTalent` in match-core.ts (the dynamic-weight
 * normalisation → PHS multiplier → ghost penalty → 0-100 clamp tail). It takes
 * plain numbers in and returns the composed score + breakdown, with NO Supabase /
 * Deno / network dependency, so it can be unit-tested from the web package's vitest
 * suite (see apps/web/src/lib/matchScoring.test.ts) the same way match-reasoning.ts
 * is. This is the test seam for the money-adjacent scoring math the audit flagged as
 * having zero coverage.
 *
 * INVARIANT: this module must stay behaviour-identical to the inline code it replaced.
 * Any change here changes match scores — treat as money-adjacent, gate behind the
 * golden-vector tests + a sample-generation byte-compare before deploying match-core.
 */

export interface ScoreDim {
  name: string
  score: number
  weight: number
}

// ── Pure per-dimension scorers ──────────────────────────────────────────────
//
// Each of these was extracted byte-for-byte from the inline body of `scoreTalent`
// in match-core.ts. They take plain, already-fetched values in and return a
// number | null out, with NO Supabase / Deno / network dependency, so the
// money-adjacent per-dimension math can be unit-tested from the web package's
// vitest suite. INVARIANT: the expressions, constants, operators and ordering
// must stay identical to the inline code they replaced — any change here changes
// match scores.

/**
 * Behavioural-fitness dimension (0-100) from the talent's derived behavioural
 * tags, weighted by BEHAVIORAL_WEIGHTS. Returns null when no behavioural tag is
 * present (so the caller can soft-weight the dimension).
 */
export function computeBehavioralFitness(tags: Record<string, number>): number | null {
  const BEHAVIORAL_WEIGHTS: Record<string, number> = {
    ownership: 1.2, communication_clarity: 1.0, emotional_maturity: 1.1,
    problem_solving: 1.1, resilience: 1.0, results_orientation: 1.1,
    professional_attitude: 1.0, confidence: 0.9, coachability: 1.1,
  }
  let bfNum = 0, bfDen = 0
  for (const [key, w] of Object.entries(BEHAVIORAL_WEIGHTS)) {
    const s = tags[key]
    if (s != null) { bfNum += s * w; bfDen += w }
  }
  return bfDen > 0 ? (bfNum / bfDen) * 100 : null
}

/**
 * Salary-fit dimension (0-100). Returns null when there isn't enough salary data
 * to score (role has no max, or talent has no minimum expectation).
 */
export function computeSalaryFit(
  roleSalaryMax: number | null,
  talentSalMin: number | null,
  talentSalMax: number | null,
): number | null {
  let salaryFit: number | null = null
  if (roleSalaryMax != null && talentSalMin != null) {
    if (roleSalaryMax >= (talentSalMax ?? talentSalMin)) {
      salaryFit = 100
    } else if (roleSalaryMax >= talentSalMin) {
      const range = (talentSalMax ?? talentSalMin) - talentSalMin
      salaryFit = range > 0 ? 50 + ((roleSalaryMax - talentSalMin) / range) * 50 : 75
    } else {
      const gap = talentSalMin - roleSalaryMax
      salaryFit = Math.max(0, 100 - (gap / talentSalMin) * 200)
    }
  }
  return salaryFit
}

/**
 * Employment-type-fit dimension (0-100). Returns null when the talent has no
 * employment-type preferences, or the role's type isn't in the compat table.
 */
export function computeEmploymentFit(
  employmentType: string,
  talentEmpPrefs: string[],
): number | null {
  const EMP_COMPAT: Record<string, Record<string, number>> = {
    full_time:  { full_time: 100, contract: 70, part_time: 40, gig: 20, internship: 10 },
    contract:   { full_time: 70,  contract: 100, part_time: 40, gig: 30, internship: 10 },
    part_time:  { full_time: 40,  contract: 40,  part_time: 100, gig: 70, internship: 30 },
    gig:        { full_time: 20,  contract: 30,  part_time: 70,  gig: 100, internship: 40 },
    internship: { full_time: 10,  contract: 10,  part_time: 30,  gig: 40, internship: 100 },
  }
  let employmentFit: number | null = null
  if (talentEmpPrefs.length > 0) {
    const row = EMP_COMPAT[employmentType]
    if (row) employmentFit = talentEmpPrefs.reduce((best, pref) => Math.max(best, row[pref] ?? 0), 0)
  }
  return employmentFit
}

/**
 * Experience-fit dimension (0-100). Returns null when the talent's years of
 * experience are unknown or the role's experience level isn't in EXP_RANGES.
 */
export function computeExperienceFit(
  talentYearsExp: number | null,
  experienceLevel: string,
): number | null {
  const EXP_RANGES: Record<string, [number, number]> = {
    junior: [0, 2], internship: [0, 1], mid: [2, 5], senior: [5, 10], lead: [8, 99],
  }
  let experienceFit: number | null = null
  if (talentYearsExp != null && experienceLevel && EXP_RANGES[experienceLevel]) {
    const [rMin, rMax] = EXP_RANGES[experienceLevel]
    if (talentYearsExp >= rMin && talentYearsExp <= rMax) {
      experienceFit = 100
    } else if (talentYearsExp > rMax) {
      experienceFit = Math.max(30, 90 - (talentYearsExp - rMax) * 10)
    } else {
      experienceFit = Math.max(10, 80 - (rMin - talentYearsExp) * 20)
    }
  }
  return experienceFit
}

/**
 * Education-fit dimension (0-100). When acceptNoExperience is set, education is a
 * soft signal only and resolves to 100. Returns null when the talent's education
 * level or the effective minimum is unknown.
 */
export function computeEducationFit(
  talentEduLevel: string | null,
  effectiveMinEdu: string | null,
  acceptNoExperience: boolean,
): number | null {
  const EDU_ORDER: Record<string, number> = {
    spm: 1, diploma: 2, degree: 3, masters: 4, phd: 5, professional_cert: 3, other: 2,
  }
  let educationFit: number | null = null
  if (talentEduLevel && effectiveMinEdu) {
    if (acceptNoExperience) {
      educationFit = 100
    } else {
      const talentRank = EDU_ORDER[talentEduLevel] ?? 0
      const minRank    = EDU_ORDER[effectiveMinEdu] ?? 0
      educationFit = talentRank >= minRank ? 100 : Math.max(20, 100 - (minRank - talentRank) * 30)
    }
  }
  return educationFit
}

/**
 * Location-fit dimension (0-100) from postcode-prefix overlap. Returns null when
 * location doesn't matter to the talent, or either postcode is missing.
 */
export function computeLocationScore(
  talentLocMatters: boolean,
  talentPostcode: string | null,
  rolePostcode: string | null,
): number | null {
  let locationScore: number | null = null
  if (talentLocMatters && talentPostcode && rolePostcode) {
    const a = talentPostcode.replace(/\s+/g, '')
    const b = rolePostcode.replace(/\s+/g, '')
    if (a === b) locationScore = 100
    else if (a.length >= 3 && b.length >= 3 && a.slice(0, 3) === b.slice(0, 3)) locationScore = 70
    else if (a.length >= 2 && b.length >= 2 && a.slice(0, 2) === b.slice(0, 2)) locationScore = 40
    else if (a.length >= 1 && b.length >= 1 && a.slice(0, 1) === b.slice(0, 1)) locationScore = 20
    else locationScore = 0
  }
  return locationScore
}

/**
 * Skill-match dimension (0-100). Required skills are hard-filtered upstream, so
 * any required overlap scores 100; preferred-skill overlap adds up to +30, capped
 * at 100. Returns null when the role lists no required and no preferred skills.
 */
export function computeSkillMatch(
  roleRequiredSkills: string[],
  rolePreferredSkills: string[],
  talentSkills: string[],
): number | null {
  let skillMatch: number | null = null
  if (roleRequiredSkills.length > 0 || rolePreferredSkills.length > 0) {
    const reqHits = roleRequiredSkills.filter((s) => talentSkills.includes(s)).length
    const prefHits = rolePreferredSkills.filter((s) => talentSkills.includes(s)).length
    const reqScore  = roleRequiredSkills.length > 0 ? (reqHits / roleRequiredSkills.length) * 100 : 100
    const prefBonus = rolePreferredSkills.length > 0 ? (prefHits / rolePreferredSkills.length) * 30 : 0
    skillMatch = Math.min(100, reqScore + prefBonus)
  }
  return skillMatch
}

/**
 * Language-match dimension (0-100). The language code is hard-filtered upstream;
 * here only the proficiency level is scored, averaged across required languages.
 * Returns null when the role requires no languages.
 */
export function computeLanguageMatch(
  roleLanguagesRequired: Array<{ code: string; level: string }>,
  talentLangProf: Array<{ code: string; level: string }>,
): number | null {
  const LEVEL_RANK: Record<string, number> = { basic: 1, conversational: 2, fluent: 3, native: 4 }
  let languageMatch: number | null = null
  if (roleLanguagesRequired.length > 0) {
    const perLang = roleLanguagesRequired.map((req) => {
      const tp = talentLangProf.find((p) => p.code === req.code)
      if (!tp) return 50 // talent has the code (legacy text[]) but no level set
      const need = LEVEL_RANK[req.level] ?? 2
      const got  = LEVEL_RANK[tp.level]  ?? 2
      if (got >= need) return 100
      const gap = need - got
      return Math.max(20, 100 - gap * 30)
    })
    languageMatch = perLang.length > 0
      ? perLang.reduce((a, b) => a + b, 0) / perLang.length
      : null
  }
  return languageMatch
}

/**
 * Culture-fit dimension (0-100): dot-product of the talent's culture wants with
 * the HM's culture offers, averaged over CULTURE_KEYS. This dimension is
 * qualitative (weight 0 in the final mix) but reused by the PHS pAccept fallback.
 * `cultureOffers` may be null/undefined (treated as all-zero offers).
 */
export function computeCultureFit(
  tags: Record<string, number>,
  cultureOffers: Record<string, number> | null | undefined,
  cultureKeys: readonly string[],
): number {
  let cultureFitSum = 0
  for (const key of cultureKeys) {
    const talentWant = tags[key] ?? 0
    const hmOffer = (cultureOffers ?? {})[key] ?? 0
    cultureFitSum += talentWant * hmOffer
  }
  return (cultureFitSum / cultureKeys.length) * 100
}

export interface PhsContext {
  /** profiles.ghost_score (0 when absent). */
  ghostScore: number
  /** system_config ghost threshold (default 3). */
  ghostThreshold: number
  hmInActiveWindow: boolean
  talentInActiveWindow: boolean
  /** hm_quality_factor (default 1.0). */
  hmQualityFactor: number
  /** Stored PHS rates from the talent row; null → rule-based fallback. */
  phsShowStored: number | null
  phsAcceptStored: number | null
  phsProbStored: number | null
  phsStay6mStored: number | null
  /** Dimension scores reused by the PHS fallbacks. */
  salaryFit: number | null
  cultureFit: number
  /** Only its presence (!= null) is consulted, mirroring the original. */
  cultureOffers: Record<string, number> | null | undefined
  employmentFit: number | null
  backgroundScore: number
  /** derived behavioural tags (ownership / coachability / resilience used here). */
  tags: Record<string, number>
  /** tag_compatibility — the rawScore fallback when no dimension has weight. */
  tagComp: number
}

export interface ComposedScore {
  rawScore: number
  totalW: number
  ghostPenalty: number
  activeWindowBoost: number
  pShow: number
  pAccept: number
  pProbation: number
  pStay6m: number
  phsMultiplier: number
  finalScore: number
  activeDims: string[]
  effectiveWeights: Record<string, number>
}

/**
 * Compose the final 0-100 match score from the assembled dimension array and the
 * PHS context. Behaviour-identical to the original inline tail of scoreTalent.
 */
export function composeFinalScore(dims: ScoreDim[], ctx: PhsContext): ComposedScore {
  // Dynamic weight normalisation.
  const totalW = dims.reduce((acc, d) => acc + d.weight, 0)
  const rawScore = totalW > 0 ? dims.reduce((acc, d) => acc + d.score * d.weight, 0) / totalW : ctx.tagComp

  const ghostOver = Math.max(0, ctx.ghostScore - (ctx.ghostThreshold - 1))
  const ghostPenalty = ghostOver * 10
  const activeWindowBoost = (ctx.hmInActiveWindow && ctx.talentInActiveWindow) ? 5 : 0

  // PHS — Probability of Hire Success.
  const pShow = ctx.phsShowStored ?? Math.max(0.10, 1.0 - ctx.ghostScore * 0.15)
  const salFitN = (ctx.salaryFit ?? 50) / 100
  const culFitN = ctx.cultureOffers != null ? ctx.cultureFit / 100 : 0.5
  const empFitN = (ctx.employmentFit ?? 60) / 100
  const pAccept = ctx.phsAcceptStored ?? (salFitN * 0.6 + culFitN * 0.3 + empFitN * 0.1)
  const ownTag = ctx.tags['ownership'] ?? 0.5
  const coaTag = ctx.tags['coachability'] ?? 0.5
  const resTag = ctx.tags['resilience'] ?? 0.5
  const pProbation = ctx.phsProbStored ?? (ownTag * 0.4 + coaTag * 0.35 + resTag * 0.25)
  const pStay6m = ctx.phsStay6mStored ?? (pProbation * 0.6 + (ctx.backgroundScore / 100) * 0.4)
  const phsMultiplier = 0.60 + 0.40 * (pAccept * pShow * pProbation * pStay6m)

  const finalScore = Math.min(100, Math.max(0,
    rawScore * phsMultiplier * ctx.hmQualityFactor - ghostPenalty + activeWindowBoost,
  ))

  const activeDims = dims.filter((d) => d.weight > 0).map((d) => d.name)
  const effectiveWeights: Record<string, number> = {}
  if (totalW > 0) {
    for (const d of dims) effectiveWeights[d.name] = d.weight / totalW
  }

  return {
    rawScore, totalW, ghostPenalty, activeWindowBoost,
    pShow, pAccept, pProbation, pStay6m, phsMultiplier,
    finalScore, activeDims, effectiveWeights,
  }
}
