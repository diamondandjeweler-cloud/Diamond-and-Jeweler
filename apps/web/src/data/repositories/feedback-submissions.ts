import { supabase } from '../../lib/supabase'

// ── Interview feedback writes ────────────────────────────────────────────────
// `feedback_submissions` records the post-interview rating + comment a
// participant leaves (routes/InterviewFeedback.tsx). This centralizes the write
// behind one seam (mirrors src/data/repositories/matches.ts).
//
// Functions return the query BUILDER (not awaited) so call sites keep their own
// terminal operators and error handling (the caller inspects the 23505 unique
// violation to avoid double-awarding points) — behaviour is byte-identical to
// the inlined query it replaces.

// ── Writes ────────────────────────────────────────────────────────────────────
/** Insert an interview-feedback submission (InterviewFeedback submit). */
export function insertFeedbackSubmission(row: Record<string, unknown>) {
  return supabase.from('feedback_submissions').insert(row)
}
