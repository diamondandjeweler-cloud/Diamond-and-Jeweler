import { supabase } from '../../lib/supabase'

// ── market_rate_cache: salary benchmarks ─────────────────────────────────────
// Powers the market-rate warning shown during role creation and the admin
// benchmark editor. Mirrors matches.ts / points.ts — every function returns the
// query builder verbatim, so callers keep their own terminal (.maybeSingle /
// .then / await) and projections are passed through unchanged.

/** Benchmark band for the role-creation warning → { data: {min,max,median}|null, error }. */
export function getMarketRate(title: string, location: string, experience: string) {
  return supabase.from('market_rate_cache').select('min_salary, max_salary, median_salary')
    .ilike('job_title', title).eq('location', location).eq('experience_level', experience)
    .limit(1).maybeSingle()
}

/** All benchmark rows for the admin editor, ordered by title then level. */
export function listMarketRates() {
  return supabase.from('market_rate_cache').select('*').order('job_title').order('experience_level')
}

/** Insert a benchmark row. */
export function insertMarketRate(row: Record<string, unknown>) {
  return supabase.from('market_rate_cache').insert(row)
}

/** Patch a benchmark row by id. */
export function updateMarketRate(id: string, patch: Record<string, unknown>) {
  return supabase.from('market_rate_cache').update(patch).eq('id', id)
}

/** Delete a benchmark row by id. */
export function deleteMarketRate(id: string) {
  return supabase.from('market_rate_cache').delete().eq('id', id)
}
