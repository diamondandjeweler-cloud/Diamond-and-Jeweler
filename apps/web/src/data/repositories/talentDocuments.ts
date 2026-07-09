import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/db.generated'

type TalentDocumentRow = Database['public']['Tables']['talent_documents']['Row']
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
    // talent_documents has no created_at column — the newest upload is uploaded_at.
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<Pick<TalentDocumentRow, 'storage_path' | 'file_name'>>()
}

/** Insert one or more talent_documents rows (payload built at call site; onboarding caller keeps its best-effort .then). */
export function insertTalentDocuments(rows: TalentDocumentInsert | TalentDocumentInsert[]) {
  // The single-vs-array union satisfies neither insert() overload; cast to the
  // array overload. .insert() accepts a single object at runtime too, so both
  // shapes pass through unchanged.
  return supabase.from('talent_documents').insert(rows as TalentDocumentInsert[])
}
