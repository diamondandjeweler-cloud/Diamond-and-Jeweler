import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type MonthlyBoostRow = Database['public']['Tables']['monthly_character_boost']['Row']

// ── monthly_character_boost: admin monthly weighting submissions ─────────────
// Mirrors systemConfig.ts / points.ts — the function returns the query BUILDER
// so the caller keeps its own .then; only metadata (submitted_at) is selected,
// never the encrypted characters, verbatim from the original call site.

/** Submission timestamp for a month (MonthlyBoostPanel) → caller keeps its .then. */
export function boostSubmittedAtForMonth(month: string) {
  return supabase
    .from('monthly_character_boost')
    .select('submitted_at')
    .eq('month', month)
    .maybeSingle()
    .returns<Pick<MonthlyBoostRow, 'submitted_at'>>()
}
