import { supabase } from '../../lib/supabase'

// ── Stale-loop nudge reads ───────────────────────────────────────────────────
// Nudges chase a party (hm/talent) when a match loop goes stale; EditRole shows
// the most recent still-open nudge for the role as a banner. Centralizes the
// `stale_loop_nudges` table behind one seam (mirrors src/data/repositories/
// matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.maybeSingle) — behaviour is byte-identical to the inlined
// query it replaces. The .select projection is passed through verbatim so
// PostgREST column lists cannot drift.

/**
 * Most recent open (unanswered) nudge for a subject, scoped by party — newest
 * first, capped at 1. Caller adds .maybeSingle().
 */
export function latestOpenNudge(party: string, subjectId: string) {
  return supabase
    .from('stale_loop_nudges')
    .select('id, gap_payload, response_at')
    .eq('party', party)
    .eq('subject_id', subjectId)
    .is('response_at', null)
    .order('sent_at', { ascending: false })
    .limit(1)
}
