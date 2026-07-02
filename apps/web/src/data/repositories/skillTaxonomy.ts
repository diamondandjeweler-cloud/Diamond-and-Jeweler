import { supabase } from '../../lib/supabase'

// ── skill_taxonomy: canonical skill catalogue for role/talent forms ──────────
// Mirrors systemConfig.ts / points.ts — the function returns the query BUILDER
// so the caller keeps its own .then, and the .select projection is passed
// through verbatim from the original call site (SkillChipInput).

/** Full skill pool ordered by display name (SkillChipInput) → caller keeps its .then. */
export function listSkillTaxonomy() {
  return supabase.from('skill_taxonomy')
    .select('slug, display_en, category, aliases')
    .order('display_en')
}
