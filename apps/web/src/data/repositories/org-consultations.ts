import { supabase } from '../../lib/supabase'

// ── Org-consultation reads & writes ──────────────────────────────────────────
// Backs the HM org-chart consultation flow (list → detail → new). Centralizes
// the `org_consultations` table behind one seam (mirrors src/data/repositories/
// matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.single / .then via await) — behaviour is byte-identical
// to the inlined queries they replace. Each .select projection is passed through
// verbatim from the call site so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/** Every consultation, newest first (OrgChartList — caller awaits directly). */
export function orgConsultationsList() {
  return supabase
    .from('org_consultations')
    .select('*')
    .order('created_at', { ascending: false })
}

/** A single consultation by id (OrgChartDetail — caller adds .single()). */
export function orgConsultationById(id: number) {
  return supabase.from('org_consultations').select('*').eq('id', id)
}

// ── Writes ────────────────────────────────────────────────────────────────────
/**
 * Insert a new consultation, returning its id (OrgChartNew — caller adds
 * .single()).
 */
export function insertOrgConsultation(row: Record<string, unknown>) {
  return supabase.from('org_consultations').insert(row).select('id')
}

/** Patch a consultation by id (OrgChartDetail edits). */
export function updateOrgConsultation(id: number, patch: Record<string, unknown>) {
  return supabase.from('org_consultations').update(patch).eq('id', id)
}
