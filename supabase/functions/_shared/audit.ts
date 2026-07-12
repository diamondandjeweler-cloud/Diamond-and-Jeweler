/**
 * Shared audit helper for Edge Functions.
 * Writes a row to public.audit_log via the log_audit_event RPC.
 *
 * User-agents are SHA-256 hashed (sufficient entropy). The client IP is a
 * LOW-entropy value — the entire IPv4 keyspace (~2^32) is precomputable in
 * minutes, so a plain SHA-256 of it is trivially reversible from a DB dump. The
 * IP is therefore keyed-hashed with HMAC-SHA256 using a server-held secret
 * pepper (AUDIT_IP_PEPPER) so the stored value cannot be brute-forced without
 * the secret. If the pepper is unset it falls back to plain SHA-256 (no worse
 * than before) — set the AUDIT_IP_PEPPER edge secret to activate the guarantee.
 */
import { adminClient } from './supabase.ts'
import { createLogger } from './logger.ts'

const log = createLogger('audit')

type AuditAction =
  | 'login' | 'logout' | 'login_failed' | 'session_expired'
  | 'password_changed' | 'password_reset_requested'
  | 'mfa_enrolled' | 'mfa_challenge_passed' | 'mfa_challenge_failed'
  | 'account_created' | 'account_soft_deleted' | 'account_restored' | 'profile_updated'
  | 'consent_granted' | 'consent_revoked' | 'consent_renewed'
  | 'dsr_submitted' | 'dsr_completed' | 'dsr_export_downloaded'
  | 'admin_profile_view' | 'admin_talent_view' | 'admin_file_view' | 'admin_action'
  | 'file_uploaded' | 'file_deleted' | 'file_viewed'
  | 'match_generated' | 'match_accepted' | 'match_declined' | 'match_expired'
  | 'offer_made' | 'offer_accepted' | 'offer_declined'
  | 'breach_detected' | 'breach_notified_dpo' | 'breach_notified_user'
  | 'data_purged' | 'cron_run'

interface AuditParams {
  actorId:      string | null
  actorRole:    string
  subjectId:    string | null
  action:       AuditAction
  resourceType?: string
  resourceId?:   string
  ip?:           string   // raw — will be hashed
  ua?:           string   // raw — will be hashed
  metadata?:     Record<string, unknown>
}

async function sha256hex(input: string): Promise<string> {
  if (!input) return ''
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')

async function hmacSha256hex(input: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(input))
  return toHex(sig)
}

/**
 * Keyed hash for the low-entropy client IP. With AUDIT_IP_PEPPER set, the stored
 * value cannot be brute-forced from a DB dump alone; without it, falls back to
 * plain SHA-256 (unchanged from before). Exported for hermetic testing.
 */
export async function hashIp(ip: string): Promise<string> {
  if (!ip) return ''
  const pepper = Deno.env.get('AUDIT_IP_PEPPER')
  return pepper ? hmacSha256hex(ip, pepper) : sha256hex(ip)
}

export async function logAudit(p: AuditParams): Promise<void> {
  try {
    const [ipHash, uaHash] = await Promise.all([
      p.ip ? hashIp(p.ip) : Promise.resolve(null),
      p.ua ? sha256hex(p.ua) : Promise.resolve(null),
    ])

    const db = adminClient()
    await db.rpc('log_audit_event', {
      p_actor_id:      p.actorId,
      p_actor_role:    p.actorRole,
      p_subject_id:    p.subjectId,
      p_action:        p.action,
      p_resource_type: p.resourceType ?? null,
      p_resource_id:   p.resourceId ?? null,
      p_ip_hash:       ipHash,
      p_ua_hash:       uaHash,
      p_metadata:      p.metadata ?? {},
    })
  } catch (e) {
    // Audit failures must never crash the calling function.
    log.error('[audit] log failed:', e)
  }
}

/** Extract client IP from a Deno serve Request. */
export function extractIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? ''
}
