import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type AuditLogRow = Database['public']['Tables']['audit_log']['Row']

// ── audit_log: PDPA access-log reads ─────────────────────────────────────────
// Centralizes reads of the audit_log table for the user-facing access log on
// /data-requests. Mirrors systemConfig.ts / points.ts — functions return the
// query BUILDER so callers keep their own terminal handling, and the .select
// projection + action list are passed through verbatim from the call site.

/** Access-log rows where the given user is the subject (fixed PDPA-visible action list), newest first, capped at 100. Caller keeps its own await. */
export function listSubjectAccessLog(subjectId: string) {
  return supabase
    .from('audit_log')
    .select('id, actor_role, action, resource_type, created_at')
    .eq('subject_id', subjectId)
    .in('action', ['admin_profile_view', 'admin_talent_view', 'admin_file_view', 'dsr_completed', 'dsr_export_downloaded', 'file_viewed'])
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<Pick<AuditLogRow, 'id' | 'actor_role' | 'action' | 'resource_type' | 'created_at'>[]>()
}
