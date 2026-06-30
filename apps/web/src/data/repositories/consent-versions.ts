import { supabase } from '../../lib/supabase'

// ── Consent-version reads ────────────────────────────────────────────────────
// `consent_versions` holds the active legal/consent documents the re-consent UX
// (legal/Consent.tsx) renders for the user to acknowledge. This centralizes the
// query behind one seam (mirrors src/data/repositories/matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.then) — behaviour is byte-identical to the inlined query
// it replaces. The .select projection is passed through verbatim from the call
// site so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/**
 * All currently-active consent versions (legal/Consent.tsx) — caller adds
 * .then(({ data }) => …).
 */
export function activeConsentVersions() {
  return supabase.from('consent_versions').select('*').eq('is_active', true)
}
