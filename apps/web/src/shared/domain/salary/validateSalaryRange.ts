// Pure, framework-free salary-range validator (domain layer — no React/router/
// Supabase imports; see .eslintrc.cjs domain-purity rule).
//
// Three call sites (PostRole, EditRole, TalentProfile) historically hand-rolled
// this check with DIVERGENT rules and messages. This validator preserves each
// site's exact behavior by parameterizing every difference rather than unifying
// them — callers opt into the negativity and ceiling checks and supply their own
// messages/i18n strings.

export interface SalaryCeilingPolicy {
  /** Upper bound `max` must not exceed. */
  limit: number
  /** Message returned when `max` exceeds `limit`. */
  message: string
}

export interface SalaryNegativePolicy {
  /** Message returned when either bound is below zero. */
  message: string
}

export interface SalaryRangeOptions {
  /**
   * When provided, both bounds must be >= 0. Checked FIRST. Sites that never
   * validated negativity (PostRole, EditRole) simply omit this.
   */
  negative?: SalaryNegativePolicy
  /**
   * When provided, `max` must not exceed `limit`. Checked SECOND. Only
   * TalentProfile enforces a ceiling.
   */
  ceiling?: SalaryCeilingPolicy
  /** Message returned when `min > max`. Checked LAST. */
  minMaxMessage: string
  /**
   * TalentProfile-only quirk: the `min > max` rule fires only when `max > 0`
   * (a zero max is treated as "unspecified" and skips the comparison). Default
   * false reproduces PostRole/EditRole, which compare unconditionally.
   */
  minMaxRequiresMaxAboveZero?: boolean
}

/**
 * Returns the first violated rule's message, or `null` when the range is valid.
 *
 * Rules run in a fixed order — negativity, then ceiling, then `min <= max` —
 * matching the original inline check ordering at every call site. Bounds are
 * taken as plain numbers; callers that coalesced nullable values (e.g.
 * `salary_min ?? 0`) should pass the already-coalesced value to preserve behavior.
 */
export function validateSalaryRange(
  min: number,
  max: number,
  opts: SalaryRangeOptions,
): string | null {
  if (opts.negative && (min < 0 || max < 0)) {
    return opts.negative.message
  }
  if (opts.ceiling && max > opts.ceiling.limit) {
    return opts.ceiling.message
  }
  if (min > max && (!opts.minMaxRequiresMaxAboveZero || max > 0)) {
    return opts.minMaxMessage
  }
  return null
}
