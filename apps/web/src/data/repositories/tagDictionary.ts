import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type TagDictionaryRow = Database['public']['Tables']['tag_dictionary']['Row']
type TagDictionaryInsert = Database['public']['Tables']['tag_dictionary']['Insert']

// ── tag_dictionary: matching-tag admin CRUD ──────────────────────────────────
// Centralizes the tag_dictionary table (admin TagPanel). Mirrors systemConfig.ts
// / points.ts — every function returns the query BUILDER, so callers keep their
// own terminal operator (await / .then) and each .select projection / payload is
// passed through verbatim from the original call site.

/** All tags ordered by name for the admin panel → { data, error }. */
export function listTags() {
  return supabase
    .from('tag_dictionary')
    .select('id, tag_name, category, weight_multiplier, is_active')
    .order('tag_name')
    .returns<Pick<TagDictionaryRow, 'id' | 'tag_name' | 'category' | 'weight_multiplier' | 'is_active'>[]>()
}

/** Insert a new tag row (payload built verbatim at the call site) → { error }. */
export function insertTag(row: TagDictionaryInsert) {
  return supabase.from('tag_dictionary').insert(row)
}

/** Toggle a tag's is_active flag by id → { error }. */
export function setTagActive(id: string, isActive: boolean) {
  return supabase
    .from('tag_dictionary')
    .update({ is_active: isActive })
    .eq('id', id)
}
