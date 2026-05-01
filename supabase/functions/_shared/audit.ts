/**
 * Shared audit helper for Edge Functions.
 * Writes a row to public.audit_log via the log_audit_event RPC.
 * IPs and user-agents are SHA-256 hashed before storing — no raw PII.
 */
import { adminClient } from './supabase.ts'

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

export async function logAudit(p: AuditParams): Promise<void> {
  try {
    const [ipHash, uaHash] = await Promise.all([
      p.ip ? sha256hex(p.ip) : Promise.resolve(null),
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
    console.error('[audit] log failed:', e)
  }
}

/** Extract client IP from a Deno serve Request. */
export function extractIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? ''
}
