import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type TalentDocumentInsert = Database['public']['Tables']['talent_documents']['Insert']

// ── talent_documents: resume / cover-letter storage metadata ─────────────────
// Mirrors matches.ts / systemConfig.ts — functions return the query BUILDER so
// callers keep their own await / .then placement, and projections/payloads are
// passed through verbatim from the original call sites.

/** Latest resume document for a talent (storage_path + file_name) → maybeSingle. */
export function latestResumeDocument(talentId: string) {
  return supabase
    .from('talent_documents')
    .select('storage_path, file_name')
    .eq('talent_id', talentId)
    .eq('doc_type', 'resume')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

/** Insert one or more talent_documents rows (payload built at call site; onboarding caller keeps its best-effort .then). */
export function insertTalentDocuments(rows: TalentDocumentInsert | TalentDocumentInsert[]) {
  return supabase.from('talent_documents').insert(rows)
}
