import { supabase } from '../../lib/supabase'

// ── skill_taxonomy reads ──────────────────────────────────────────────────────
// Reference list of skills, read once by the role-form skill picker to populate
// its autocomplete pool. This centralizes that query behind one seam (mirrors
// src/data/repositories/profiles.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.then) — behaviour is byte-identical to the inlined query
// it replaces. The .select projection is passed through verbatim from the call
// site so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/** The full skill pool, ordered for display (role-form skill picker — caller chains .then()). */
export function allSkills() {
  return supabase.from('skill_taxonomy').select('slug, display_en, category, aliases').order('display_en')
}
