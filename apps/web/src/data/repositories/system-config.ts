import { supabase } from '../../lib/supabase'

// ── system_config reads & writes ──────────────────────────────────────────────
// `system_config` is a key/value store (jsonb `value`) hand-queried from the
// consult pricing page, both legal copy pages, the legal-version helper, the HM
// dashboard waiting-period band, the points wallet, the referrals page and three
// admin panels (SystemConfig / Pricing / MatchApproval). This centralizes those
// queries behind one seam (mirrors src/data/repositories/profiles.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.maybeSingle / .single / .then / .order) — behaviour is
// byte-identical to the inlined queries they replace. Each .select projection is
// passed through verbatim from the call site so PostgREST column lists cannot
// drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/**
 * key/value pairs for a set of config keys (consult pricing, pricing panel,
 * legal copy pages — caller awaits directly or chains .then()).
 */
export function configValuesByKeys(keys: string[]) {
  return supabase.from('system_config').select('key, value').in('key', keys)
}

/**
 * The jsonb value of a single config key (legal-version helper adds .single();
 * HM waiting-period band, points wallet, referrals and match-approval mode all
 * add .maybeSingle()). One function, caller picks the terminal.
 */
export function configValueByKey(key: string) {
  return supabase.from('system_config').select('value').eq('key', key)
}

/** Full config list with audit timestamp, ordered by key (admin SystemConfigPanel). */
export function allConfigRows() {
  return supabase.from('system_config').select('key, value, updated_at').order('key')
}

// ── Writes ────────────────────────────────────────────────────────────────────
/**
 * Patch the value of a single config key (admin SystemConfig / Pricing panels,
 * match-approval autopilot toggle).
 */
export function updateConfigValue(key: string, value: unknown) {
  return supabase.from('system_config').update({ value }).eq('key', key)
}
