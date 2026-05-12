-- 0110_perf_indexes.sql
--
-- Performance indexes for queries that returned 503 under load.
-- All existing single-column indexes on role_id/status remain; these
-- are covering composites that let the planner avoid table fetches.

-- matches: covering index for the common HM dashboard query
--   /rest/v1/matches?select=...&roles.hiring_manager_id=eq.xxx&status=eq.xxx
-- Lets Postgres resolve (role_id, status) from the index without touching heap rows.
CREATE INDEX IF NOT EXISTS idx_matches_role_status
  ON public.matches (role_id, status);

-- matches: covering index for the talent dashboard pending/active query
--   &talent_id=eq.xxx&status=in.(pending,active,viewed)
CREATE INDEX IF NOT EXISTS idx_matches_talent_status
  ON public.matches (talent_id, status);
