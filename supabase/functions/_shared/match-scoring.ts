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
