-- ============================================================
-- 0081 — Async talent profile extraction
--
-- Decouples LLM extraction from the onboarding submit flow so the user
-- isn't blocked behind a 30-90s LLM call (previously gated everything,
-- and the "3-5 min" copy made users panic-refresh, which corrupted state).
--
-- Talents are inserted with extraction_status='pending' and
-- is_open_to_offers=false. A background Edge Function back-fills the
-- extracted fields and flips both flags on completion. The existing
-- partial indexes on is_open_to_offers automatically exclude pending
-- talents from match-core, so no match logic changes are required.
-- ============================================================

ALTER TABLE public.talents
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'complete'
    CHECK (extraction_status IN ('pending','processing','complete','failed')),
  ADD COLUMN IF NOT EXISTS extraction_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_error text,
  ADD COLUMN IF NOT EXISTS extraction_attempts int NOT NULL DEFAULT 0;

-- Existing rows are already fully extracted, so the default 'complete' is correct.
-- New rows from onboarding will explicitly insert 'pending'.

-- Partial index for the retry/backstop worker — only touches stuck rows.
CREATE INDEX IF NOT EXISTS idx_talents_extraction_pending
  ON public.talents (extraction_started_at NULLS FIRST, created_at)
  WHERE extraction_status IN ('pending','processing');

COMMENT ON COLUMN public.talents.extraction_status IS
  'Async LLM profile extraction state. Talent is hidden from matching (is_open_to_offers=false) until status=complete.';
