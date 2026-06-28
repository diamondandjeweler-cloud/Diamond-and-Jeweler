import { supabase } from '../../lib/supabase'

// ── Match queries (recruitment) ──────────────────────────────────────────────
// First slice of the data-access layer. AUDIT CLEAN_ARCH: ~149 direct supabase
// calls bypass a repository seam, and `matches` is hand-queried from 8 route
// files — every schema/column change is an O(N) manual edit. Centralizing the
// talent-facing projection here makes it the SINGLE SOURCE OF TRUTH: it was
// copy-pasted verbatim across two TalentDashboard call sites, and it must NEVER
// include the HM-private columns (internal_reasoning, life_chart_score).
//
// These return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.order / .maybeSingle / .abortSignal) — behaviour is
// byte-identical to the inlined queries they replace.

// Keep as ONE literal string (identical to the call sites it replaces) so the
// PostgREST projection cannot drift via a concatenation typo.
const TALENT_MATCH_SELECT =
  'id, compatibility_score, status, expires_at, public_reasoning, application_summary, roles(id, title, description, salary_min, salary_max, location, work_arrangement, employment_type, hourly_rate, duration_days)'

/** Talent's matches filtered by status (caller adds ordering). */
export function talentMatchesForTalent(talentId: string, statuses: readonly string[]) {
  return supabase
    .from('matches')
    .select(TALENT_MATCH_SELECT)
    .eq('talent_id', talentId)
    .in('status', statuses as string[])
}

/** A single match by id, talent projection (caller adds .maybeSingle()). */
export function talentMatchById(matchId: string) {
  return supabase
    .from('matches')
    .select(TALENT_MATCH_SELECT)
    .eq('id', matchId)
}
