import { supabase } from '../../lib/supabase'

// ── talent_documents reads & writes ───────────────────────────────────────────
// Resume / cover-letter metadata rows pointing at private storage objects. Hand-
// queried from talent onboarding (best-effort doc rows on submit) and the talent
// profile page (view / replace resume). Centralizes those shapes behind one seam
// (mirrors src/data/repositories/matches.ts + profiles.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators (.then / .maybeSingle) — behaviour is byte-identical to the
// inlined queries they replace. Each .select projection is passed through
// verbatim from the call site so PostgREST column lists cannot drift.

// ── Reads ─────────────────────────────────────────────────────────────────────
/**
 * Latest resume document for a talent (TalentProfile "view resume" — caller adds
 * .maybeSingle()). Ordered newest-first, limited to one.
 */
export function latestResumeDoc(talentId: string) {
  return supabase
    .from('talent_documents')
    .select('storage_path, file_name')
    .eq('talent_id', talentId)
    .eq('doc_type', 'resume')
    .order('created_at', { ascending: false })
    .limit(1)
}

// ── Writes ────────────────────────────────────────────────────────────────────
/**
 * Insert document metadata row(s). Accepts a single row or an array (talent
 * onboarding inserts a best-effort resume + optional cover-letter batch; the
 * TalentProfile resume-replace inserts a single row). Caller chains its own
 * terminal (.then / .select().single() / await).
 */
export function insertTalentDocuments(
  rows: Record<string, unknown> | Record<string, unknown>[],
) {
  return supabase.from('talent_documents').insert(rows)
}
