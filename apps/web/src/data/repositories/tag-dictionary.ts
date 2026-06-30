import { supabase } from '../../lib/supabase'

// ── tag_dictionary reads & writes ─────────────────────────────────────────────
// Compatibility-tag dictionary, managed entirely by the admin TagPanel (list /
// add / toggle active). This centralizes those queries behind one seam (mirrors
// src/data/repositories/profiles.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators — behaviour is byte-identical to the inlined queries they
// replace. Each .select projection is passed through verbatim from the call site
// so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/** All tags, ordered by name (admin TagPanel list — caller awaits). */
export function allTags() {
  return supabase
    .from('tag_dictionary')
    .select('id, tag_name, category, weight_multiplier, is_active')
    .order('tag_name')
}

// ── Writes ────────────────────────────────────────────────────────────────────
/** Insert a new tag (admin TagPanel add). */
export function insertTag(row: Record<string, unknown>) {
  return supabase.from('tag_dictionary').insert(row)
}

/** Patch a tag by id — used for the active toggle (admin TagPanel). */
export function updateTag(id: string, patch: Record<string, unknown>) {
  return supabase.from('tag_dictionary').update(patch).eq('id', id)
}
