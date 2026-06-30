import { supabase } from '../../lib/supabase'

// ── company_hm_link_requests reads ────────────────────────────────────────────
// Pending requests linking a floating hiring manager to a company. Hand-queried
// from the HM dashboard (resolve the HM's own pending link request + company
// name) and the admin LinkHM panel (which floating HMs this company already has
// pending). The two call sites use different projections, so they get separate
// functions. Centralizes those shapes behind one seam (mirrors
// src/data/repositories/matches.ts + profiles.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.maybeSingle / .then / await) — behaviour is byte-identical
// to the inlined queries they replace. Each .select projection is passed through
// verbatim from the call site so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/**
 * An HM's own pending link request + linked company name (HM dashboard
 * company-context lookup — caller adds .maybeSingle()).
 */
export function pendingLinkRequestForHm(hmId: string) {
  return supabase
    .from('company_hm_link_requests')
    .select('id, companies(name)')
    .eq('hm_id', hmId)
    .eq('status', 'pending')
}

/**
 * HM ids a company already has a pending link request for (admin LinkHM panel
 * dedupe set — caller awaits directly).
 */
export function pendingLinkRequestHmIdsForCompany(companyId: string) {
  return supabase
    .from('company_hm_link_requests')
    .select('hm_id')
    .eq('company_id', companyId)
    .eq('status', 'pending')
}
