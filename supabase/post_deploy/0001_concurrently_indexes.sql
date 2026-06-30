-- post_deploy/0001_concurrently_indexes.sql
-- ============================================================================
-- RUN OUTSIDE A TRANSACTION, via psql directly (NOT via `supabase db reset`,
-- the migration runner, or any tool that wraps statements in a transaction).
--
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block. The
--   migration runner (and `supabase db reset`) wraps each migration file in a
--   single transaction, so any CREATE INDEX CONCURRENTLY placed in a normal
--   migration SILENTLY NEVER CREATES THE INDEX in prod (the statement errors
--   with 25001, or — worse — leaves an INVALID index behind). The talent
--   pre-filter indexes below were authored that way in 0074 and therefore very
--   likely DO NOT EXIST in production. This script re-creates them safely.
--
-- HOW TO RUN (one statement at a time is fine; each is independent + idempotent):
--   psql "$DATABASE_URL" -f supabase/migrations/post_deploy/0001_concurrently_indexes.sql
--
-- psql runs each top-level statement in its own implicit transaction (autocommit
-- on by default for -f scripts), which is exactly what CONCURRENTLY needs. Do
-- NOT wrap this file in BEGIN/COMMIT.
--
-- VERIFY AFTERWARD (all three must be present AND valid):
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'talents'
--     AND indexname IN ('idx_talents_open','idx_talents_salary_min','idx_talents_emp_type');
--
--   -- check none were left INVALID (an interrupted CONCURRENTLY build):
--   SELECT c.relname, i.indisvalid
--   FROM pg_index i
--   JOIN pg_class c ON c.oid = i.indexrelid
--   WHERE c.relname IN ('idx_talents_open','idx_talents_salary_min','idx_talents_emp_type');
--   -- If any indisvalid = false: DROP INDEX CONCURRENTLY <name>; then re-run.
--
-- SOURCE: all three index definitions are copied faithfully from
--   supabase/migrations/0074_match_queue.sql  (lines 154-164)
-- where they were (incorrectly) embedded inside the transactional migration.
-- ============================================================================

-- ── from 0074_match_queue.sql ───────────────────────────────────────────────
-- Pre-filter support for the match-core SQL filters applied before any rows
-- are transferred (is_open_to_offers gate, salary floor, employment-type @>).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talents_open
  ON talents (is_open_to_offers, feedback_score DESC)
  WHERE is_open_to_offers = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talents_salary_min
  ON talents (expected_salary_min)
  WHERE is_open_to_offers = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talents_emp_type
  ON talents USING GIN (employment_type_preferences)
  WHERE is_open_to_offers = true; -- partial: only active open-to-offers rows
