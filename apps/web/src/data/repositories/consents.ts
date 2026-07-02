import { supabase } from '../../lib/supabase'

// ── Legal consents (PDPA) ─────────────────────────────────────────────────────
// Centralizes the consent_versions table read and the record_consent RPC used
// by the /consent page. Mirrors systemConfig.ts / points.ts — functions return
// the query BUILDER so callers keep their own terminal operators (.then /
// await), and every .select projection is passed through verbatim from the
// call site.

/** Active consent_versions rows (consent page body copy). Caller keeps its own .then. */
export function activeConsentVersions() {
  return supabase.from('consent_versions').select('*').eq('is_active', true)
}

/** Record the user's consent via the SECURITY DEFINER record_consent RPC → { error }. */
export function recordConsent(version: string, ipHash: string | null) {
  return supabase.rpc('record_consent', {
    p_version: version,
    p_ip_hash: ipHash,
  })
}
