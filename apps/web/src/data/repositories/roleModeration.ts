import { supabase } from '../../lib/supabase'

// ── Role moderation: audit events + appeal/decision RPCs ─────────────────────
// Mirrors roles.ts / systemConfig.ts — every function returns the query/RPC
// BUILDER so callers keep their own await/.then and each .select projection
// is passed through verbatim from the original call site.

/** Moderation audit trail for a role — latest 20 events, newest first (admin ModerationPanel). */
export function listRoleModerationEvents(roleId: string) {
  return supabase
    .from('role_moderation_events')
    .select('id, event_type, prev_status, new_status, score, category, reason, provider, created_at')
    .eq('role_id', roleId)
    .order('created_at', { ascending: false })
    .limit(20)
}

/** HM appeals a moderation decision on their role (RPC `appeal_role_moderation`). */
export function appealRoleModeration(roleId: string, appealText: string) {
  return supabase.rpc('appeal_role_moderation', {
    p_role_id: roleId,
    p_appeal_text: appealText,
  })
}

/** Admin approves/rejects a flagged role (RPC `admin_decide_role_moderation`). */
export function adminDecideRoleModeration(roleId: string, decision: 'approved' | 'rejected', reason: string, category: string | null) {
  return supabase.rpc('admin_decide_role_moderation', {
    p_role_id: roleId,
    p_decision: decision,
    p_reason: reason,
    // p_category is a nullable arg (null = uncategorised). Preserve the null
    // value reaching PostgREST — cast only to satisfy the arg type.
    p_category: category as string,
  })
}
