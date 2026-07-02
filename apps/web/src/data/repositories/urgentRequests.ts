import { supabase } from '../../lib/supabase'

// ── urgent_priority_requests: paid urgent-match requests ─────────────────────
// Mirrors matches.ts / systemConfig.ts — functions return the query BUILDER so
// callers keep their own await placement; projections pass through verbatim.

/** Most recent completed find_job urgent request since `sinceIso` (computed at call time) → maybeSingle. */
export function lastCompletedFindJobRequest(userId: string, sinceIso: string) {
  return supabase
    .from('urgent_priority_requests')
    .select('id, result_id, completed_at')
    .eq('user_id', userId)
    .eq('request_type', 'find_job')
    .eq('status', 'completed')
    .gte('created_at', sinceIso)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}
