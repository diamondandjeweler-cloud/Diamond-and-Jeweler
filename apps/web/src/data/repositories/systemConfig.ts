import { supabase } from '../../lib/supabase'

// ── system_config: platform key/value settings (jsonb `value` column) ─────────
// Centralizes reads/writes of the system_config table. Mirrors matches.ts /
// points.ts — every function returns the query BUILDER, so callers keep their
// own terminal operator (.maybeSingle / .then / await) and each .select
// projection is passed through verbatim from the original call site.
/** One config row by key → { data: { value } | null, error }. */
export function getConfigValue(key: string) {
  return supabase.from('system_config').select('value').eq('key', key).maybeSingle()
}

/** One config row by key, erroring when absent (`.single()` — lib/legalVersion.ts cache read). */
export function getConfigValueStrict(key: string) {
  return supabase.from('system_config').select('value').eq('key', key).single()
}

/** Config rows for a set of keys → { data: Array<{ key, value }> | null, error }. */
export function getConfigValues(keys: string[]) {
  return supabase.from('system_config').select('key, value').in('key', keys)
}

/** Full config list for the admin editor → { data: Array<{ key, value, updated_at }> | null, error }. */
export function listConfig() {
  return supabase.from('system_config').select('key, value, updated_at').order('key')
}

/** Update one config row's jsonb value by key → { error }. */
export function updateConfigValue(key: string, value: unknown) {
  return supabase.from('system_config').update({ value }).eq('key', key)
}
