import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

// ── admin: read-only SECURITY DEFINER RPC panels ─────────────────────────────
// Wraps the admin-dashboard RPCs (KpiPanel / AuditLogPanel). Both RPCs gate on
// is_admin() inside their SQL bodies — see migrations/0100_admin_kpis_rpc.sql
// and 0105_admin_audit_log_rpc.sql. Functions return the RPC builder so callers
// keep their own await and error handling.

/** Platform KPI snapshot via get_admin_kpis (bypasses RLS, admin-gated in SQL). */
export function getAdminKpis() {
  return supabase.rpc('get_admin_kpis')
}

/** Filtered/paged audit trail via get_admin_audit_log (params passed verbatim). */
export function getAdminAuditLog(params: {
  p_action: string | null
  p_actor_id: string | null
  p_subject_id: string | null
  p_page: number
  p_page_size: number
}) {
  // The typed client infers all RPC args as string | undefined (SQL DEFAULTs),
  // but these filters are passed as string | null (null = "no filter"). Keep the
  // null values reaching PostgREST verbatim — cast only to satisfy the arg type.
  return supabase.rpc('get_admin_audit_log', params as unknown as Database['public']['Functions']['get_admin_audit_log']['Args'])
}
