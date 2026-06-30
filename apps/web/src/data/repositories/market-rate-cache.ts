import { supabase } from '../../lib/supabase'

// ── market_rate_cache reads & writes ──────────────────────────────────────────
// Salary-benchmark cache: read by PostRole's market-range warning and fully
// CRUD-managed by the admin MarketRatePanel. This centralizes those queries
// behind one seam (mirrors src/data/repositories/profiles.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.maybeSingle / .then) — behaviour is byte-identical to the
// inlined queries they replace. Each .select projection is passed through
// verbatim from the call site so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/** All benchmark rows, ordered for the admin table (MarketRatePanel — caller awaits). */
export function allMarketRates() {
  return supabase.from('market_rate_cache').select('*').order('job_title').order('experience_level')
}

/**
 * The single benchmark matching a job title (ilike) + location + experience
 * level (PostRole market-range warning — caller adds .limit(1).maybeSingle()).
 */
export function marketRateForRole(title: string, location: string, experience: string) {
  return supabase
    .from('market_rate_cache')
    .select('min_salary, max_salary, median_salary')
    .ilike('job_title', title)
    .eq('location', location)
    .eq('experience_level', experience)
}

// ── Writes ────────────────────────────────────────────────────────────────────
/** Patch a benchmark row by id (admin MarketRatePanel edit). */
export function updateMarketRate(id: string, patch: Record<string, unknown>) {
  return supabase.from('market_rate_cache').update(patch).eq('id', id)
}

/** Delete a benchmark row by id (admin MarketRatePanel). */
export function deleteMarketRate(id: string) {
  return supabase.from('market_rate_cache').delete().eq('id', id)
}

/** Insert a new benchmark row (admin MarketRatePanel create). */
export function insertMarketRate(row: Record<string, unknown>) {
  return supabase.from('market_rate_cache').insert(row)
}
