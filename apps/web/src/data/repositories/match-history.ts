import { supabase } from '../../lib/supabase'

// ── Match-history writes ─────────────────────────────────────────────────────
// Append-only audit log of match-affecting actions (e.g. the admin cold-start
// panel records a `manual_admin` row per talent it hand-matches). Centralizes
// the `match_history` table behind one seam (mirrors src/data/repositories/
// matches.ts). Functions return the query BUILDER so callers keep their own
// terminal operator (.then via await).

/** Insert match-history rows (admin cold-start manual matches). */
export function insertMatchHistory(rows: Record<string, unknown>[]) {
  return supabase.from('match_history').insert(rows)
}
