/**
 * admin-force-match — talent availability / ban / expiry gate (finding matcher-2).
 *
 * The handler loaded `is_open_to_offers` but never consulted it, and never
 * checked profiles.is_banned or talents.profile_expires_at — so an admin could
 * force-match a talent who turned matching OFF, whose profile had expired, or
 * who had been moderated OFF the platform (banned), surfacing that person to a
 * hiring manager. The normal candidate pool (get_match_candidates §1, 0191:34-36)
 * excludes all three; force-match bypassed every one.
 *
 * This mirrors those pool gates, with the ban treated as a HARD block (a
 * moderated-off talent must never be surfaced, regardless of admin intent) and
 * availability/expiry treated as SOFT (force-matching a talent who toggled off
 * is a legitimate cold-start / ops-remediation action, but must be explicit via
 * `override_availability` and recorded in the audit trail).
 *
 * Extracted as a pure function so it is hermetically testable — index.ts serve()s
 * a port on import and cannot be imported by a test.
 */

export interface ForceMatchGateInput {
  isBanned?: boolean | null
  isOpenToOffers?: boolean | null
  /** ISO timestamp or null (talents.profile_expires_at). */
  profileExpiresAt?: string | null
  /** Caller opted to override the soft availability/expiry gate. */
  override?: boolean
  /** Injectable clock for tests; defaults to Date.now(). */
  nowMs?: number
}

export interface ForceMatchGateResult {
  ok: boolean
  /** HTTP status to return when !ok. */
  status?: number
  error?: string
  /** True when a soft gate (unavailable/expired) was bypassed via override. */
  overrode: boolean
}

/**
 * Decide whether an admin force-match against this talent is permitted.
 *   - banned                          → HARD reject (409), no override.
 *   - is_open_to_offers=false OR expired, without override → reject (409).
 *   - is_open_to_offers=false OR expired, WITH override     → allow (overrode=true).
 *   - otherwise                        → allow.
 */
export function evaluateForceMatchGate(input: ForceMatchGateInput): ForceMatchGateResult {
  // Hard gate: a banned/moderated-off talent is never force-matchable.
  if (input.isBanned === true) {
    return {
      ok: false,
      status: 409,
      error: 'Talent is banned and cannot be force-matched',
      overrode: false,
    }
  }

  const now = input.nowMs ?? Date.now()
  const expired =
    input.profileExpiresAt != null &&
    !Number.isNaN(Date.parse(input.profileExpiresAt)) &&
    Date.parse(input.profileExpiresAt) < now

  const unavailable = input.isOpenToOffers === false || expired

  if (unavailable && input.override !== true) {
    return {
      ok: false,
      status: 409,
      error:
        'Talent is not open to offers or their profile has expired. ' +
        'Pass override_availability:true to force-match anyway.',
      overrode: false,
    }
  }

  return { ok: true, overrode: unavailable }
}
