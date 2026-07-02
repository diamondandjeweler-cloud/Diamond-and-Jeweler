import { supabase } from '../../lib/supabase'

// ── Stale-loop nudges: re-engagement prompts + response recording ────────────
// Builder-return convention (mirrors roles.ts / systemConfig.ts) — callers
// keep their own await / void-.then terminal.

/** Most recent open (unanswered) HM nudge for a role, newest sent first (EditRole banner). */
export function getOpenHmNudgeForRole(roleId: string) {
  return supabase.from('stale_loop_nudges')
    .select('id, gap_payload, response_at')
    .eq('party', 'hm').eq('subject_id', roleId)
    .is('response_at', null)
    .order('sent_at', { ascending: false }).limit(1).maybeSingle()
}

/** Record a party's response to a nudge (RPC `fn_stale_loop_record_response`); fire-and-forget callers keep their void/.then. */
export function recordStaleLoopResponse(nudgeId: string, responseKind: string, responsePayload: unknown) {
  return supabase.rpc('fn_stale_loop_record_response', {
    p_nudge_id: nudgeId,
    p_response_kind: responseKind,
    p_response_payload: responsePayload,
  })
}
