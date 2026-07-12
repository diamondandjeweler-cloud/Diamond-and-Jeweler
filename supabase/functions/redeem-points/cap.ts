/**
 * redeem-points — extra-match quota cap (finding money-4).
 *
 * The DB hard-caps the counter with `CHECK (extra_matches_used between 0 and 3)`
 * on roles + talents (migration 0018) — an intentional over-charge backstop. The
 * app, however, reads the cap from system_config
 * (extra_match_cap_per_role / _per_talent, default 3). If an admin raises that
 * config above 3, the app's `used >= cap` gate would pass a 4th redemption, the
 * points would be deducted, and only THEN would the `extra_matches_used` bump hit
 * the DB CHECK (SQLSTATE 23514) — a violation that was previously swallowed,
 * leaving a charged-but-uncounted state.
 *
 * Clamp the effective cap to the DB constraint so raising the config alone can
 * NEVER push a redemption past what the database will accept. A genuinely-higher
 * cap must be a coordinated migration that raises BOTH the CHECK and the config.
 *
 * Extracted so it is hermetically testable: index.ts serve()s a port on import.
 */

/** The hard cap enforced by the DB CHECK constraint (migration 0018). */
export const DB_EXTRA_MATCH_CAP = 3

/**
 * The effective cap the app should enforce: the configured cap, clamped to the
 * DB constraint, and never negative. A non-numeric / missing config falls back
 * to the DB cap.
 */
export function effectiveExtraMatchCap(
  configValue: unknown,
  dbCap = DB_EXTRA_MATCH_CAP,
): number {
  const cfg = typeof configValue === 'number' && Number.isFinite(configValue)
    ? configValue
    : dbCap
  return Math.max(0, Math.min(cfg, dbCap))
}
