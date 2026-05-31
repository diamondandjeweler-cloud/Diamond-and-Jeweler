-- 0131 — BRIN indexes on append-only time-series columns (item 2)
--
-- BRIN stores min/max per 128-page range instead of one entry per row.
-- On monotonically-growing timestamp columns (append-only tables), BRIN
-- is ~1000× smaller than B-tree and has negligible write overhead.
-- Used primarily by range-based purge/cleanup queries, not hot reads.
--
-- Existing B-tree indexes on these columns are kept — they serve
-- equality/sort queries better. BRIN complements rather than replaces.

-- audit_log: ~rows grow at every auth event; purge job deletes older than 730d.
CREATE INDEX IF NOT EXISTS idx_audit_log_created_brin
  ON public.audit_log USING brin (created_at);

-- matches: append-only on insert; admin date-range filters and match-expire
-- expiry queries benefit from range-aware access.
CREATE INDEX IF NOT EXISTS idx_matches_created_brin
  ON public.matches USING brin (created_at);

-- notifications: purge job trims sent_at older than retention window.
CREATE INDEX IF NOT EXISTS idx_notifications_sent_brin
  ON public.notifications USING brin (sent_at);

-- interview_rounds: interviews are date-ordered; scheduler queries range.
CREATE INDEX IF NOT EXISTS idx_interview_rounds_scheduled_brin
  ON public.interview_rounds USING brin (scheduled_at);
