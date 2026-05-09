// Auth-failure telemetry. Posts to a SECURITY DEFINER RPC so anonymous
// callers can record their own failures without surfacing PII to other
// callers (the table is admin-read-only). Best-effort: a failure to log
// must never block the user.
//
// We only record:
//   - email_domain (everything after @, lower-cased)
//   - reason (Supabase error message, capped to 200 chars)
//   - user_agent
// The full email and password are NEVER sent.

import { supabase } from './supabase'

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 0) return 'unknown'
  return email.slice(at + 1).toLowerCase()
}

export function logAuthFailure(email: string, reason: string): void {
  // Fire-and-forget. Never await; never throw.
  try {
    void supabase.rpc('log_auth_failure', {
      p_email_domain: emailDomain(email),
      p_reason: reason.slice(0, 200),
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
    })
  } catch {
    /* swallow — telemetry must not affect auth UX */
  }
}
