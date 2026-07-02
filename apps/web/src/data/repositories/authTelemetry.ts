import { supabase } from '../../lib/supabase'

// ── Auth telemetry & login rate-limit RPCs ────────────────────────────────────
// Server-side login protection (check_login_rate_limit / record_login_attempt)
// plus the anonymous auth-failure telemetry RPC. Mirrors systemConfig.ts /
// points.ts — every function returns the RPC BUILDER, so callers keep their own
// terminal behaviour (Login awaits the rate-limit check but fires
// record_login_attempt as `void`; lib/authTelemetry.ts keeps its `void` +
// try/catch fire-and-forget contract).

/** RPC: server-side login rate-limit check → { data: { locked, retry_after_seconds? } | null, error } (caller awaits). */
export function checkLoginRateLimit(email: string) {
  return supabase.rpc('check_login_rate_limit', { p_email: email })
}

/** RPC: record a login attempt's outcome server-side (caller fires-and-forgets with `void`). */
export function recordLoginAttempt(email: string, succeeded: boolean) {
  return supabase.rpc('record_login_attempt', { p_email: email, p_succeeded: succeeded })
}

/** RPC: SECURITY DEFINER auth-failure telemetry — never await; caller keeps `void` + try/catch. */
export function logAuthFailureRpc(emailDomain: string, reason: string, userAgent: string | null) {
  return supabase.rpc('log_auth_failure', {
    p_email_domain: emailDomain,
    p_reason: reason,
    p_user_agent: userAgent,
  })
}
