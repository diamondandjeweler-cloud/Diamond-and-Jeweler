-- ============================================================================
-- 0137 — Performance pack v2 (follow-on to 0130–0135)
--
-- Closes the gaps from the 20-point DB perf audit (2026-06-04) that weren't
-- already covered by 0130 (timeouts), 0131 (BRIN), 0132 (partial/covering),
-- 0133 (LEAKPROOF), 0134/0135 (admin KPI MV / snapshot), 0074 (talents ETP
-- GIN), 0112 (skills/languages GIN), and 0079 (roles FTS).
--
-- Items implemented here:
--   #1  GIN on talents.deal_breakers (JSONB) — drives 9 key extractions in
--       get_match_candidates v2 per row scanned.
--   #6  Trigram GIN on roles.title + hiring_managers.job_title for ILIKE
--       substring search (current btree only helps prefix / equality).
--   #4  Composite covering index on interview_rounds(status, scheduled_at DESC)
--       INCLUDE (match_id) — replaces a sequential scan + sort for pipeline /
--       calendar views.
--   #8  get_match_candidates v2 → PARALLEL SAFE + SET search_path. Enables
--       parallel scans on the talent pool and pins the planner's helper lookup.
--   #20 Per-table autovacuum tuning on the write-hot tables (matches,
--       audit_log, notification_outbox, match_queue). Default scale factor 0.2
--       lets stats go stale on these and the planner picks bad plans.
--   #7  + #16 Diagnostic views (perf_unused_indexes, perf_table_bloat) —
--       read-only helpers for the weekly review described in #19.
--
-- Items NOT in this migration (documented as TODO so future-me knows why):
--   #9  Promote 9 deal_breaker JSONB keys to GENERATED STORED columns.
--       Skipped: rewrites the talents heap (locks + bloat); want to size the
--       write-amp impact first against a staging snapshot.
--   #10 Split LEFT JOIN life_chart_compatibility in get_match_candidates v2
--       into two SQL bodies / lateral. Skipped: would diverge from the v2
--       contract used by match-generate; safer as a v3.
--   #11 Precompute feedback_rank denormalized + indexed. Skipped: denormal.
--   #13 Wrap auth.uid() in (select auth.uid()) across every RLS policy.
--       Skipped: needs a sweep of all migrations from 0003 onward — separate
--       migration with a per-policy diff so review is auditable.
--   #15 Convert RLS IN (...) subqueries to EXISTS where set can grow.
--       Skipped: same audit pass as #13.
--   #16 pg_repack monthly cron. Skipped: pg_repack extension is not enabled
--       on Supabase managed; alternative is autovacuum tuning (#20 below).
--   #17 Declarative partitioning of audit_log / notification_outbox by month.
--       Skipped: destructive (data migration); separate dedicated migration.
--
-- All statements are idempotent (IF NOT EXISTS / OR REPLACE / guarded blocks).
-- ============================================================================


-- ── #1 GIN on talents.deal_breakers ─────────────────────────────────────────
-- jsonb_path_ops is smaller and faster than the default jsonb_ops for the
-- @> / ? / ?| / ?& operators we use in get_match_candidates v2.
CREATE INDEX IF NOT EXISTS idx_talents_deal_breakers_gin
  ON public.talents USING gin (deal_breakers jsonb_path_ops);


-- ── #6 Trigram indexes for case-insensitive substring search ───────────────
-- 0079 added bare btree on roles.title + hiring_managers.job_title — those
-- help equality and LIKE 'foo%' but not ILIKE '%foo%' nor case-insensitive
-- substring match (used by job-listing search bar + HM directory).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_roles_title_trgm
  ON public.roles USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_hm_job_title_trgm
  ON public.hiring_managers USING gin (job_title gin_trgm_ops);


-- ── #4 Composite covering on interview_rounds ──────────────────────────────
-- Pipeline / calendar views filter by status and sort by scheduled_at.
-- INCLUDE match_id so the projection is satisfied from the index leaf.
CREATE INDEX IF NOT EXISTS idx_interview_rounds_status_scheduled_cov
  ON public.interview_rounds (status, scheduled_at DESC)
  INCLUDE (match_id);


-- ── #8 get_match_candidates v2 → PARALLEL SAFE + search_path ───────────────
-- The function body is pure SELECT over indexed tables — parallel safe.
-- Pinning search_path is a defence-in-depth measure (prevents resolution
-- against an attacker-controlled schema if RLS is ever bypassed).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_match_candidates'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.get_match_candidates(
      text, integer, text, boolean, boolean, boolean, boolean, boolean,
      boolean, boolean, boolean, text, text[], uuid[], integer,
      text[], jsonb, text, text[], jsonb, text, text
    ) PARALLEL SAFE';
    EXECUTE 'ALTER FUNCTION public.get_match_candidates(
      text, integer, text, boolean, boolean, boolean, boolean, boolean,
      boolean, boolean, boolean, text, text[], uuid[], integer,
      text[], jsonb, text, text[], jsonb, text, text
    ) SET search_path = public, pg_catalog';
  END IF;
END $$;


-- ── #20 Per-table autovacuum tuning on hot churn tables ────────────────────
-- Default scale factor 0.2 means autovacuum waits until 20% of rows are dead
-- before vacuuming. On these write-heavy tables that's too lax — analyze
-- runs late, planner statistics drift, p95 query latency spikes.
-- 0.05 vacuum + 0.025 analyze ≈ daily vacuum on a 50k-row table.

ALTER TABLE public.matches SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.025
);

ALTER TABLE public.audit_log SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.025
);

ALTER TABLE public.notification_outbox SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.025
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'match_queue') THEN
    EXECUTE 'ALTER TABLE public.match_queue SET (
      autovacuum_vacuum_scale_factor  = 0.05,
      autovacuum_analyze_scale_factor = 0.025
    )';
  END IF;
END $$;


-- ── #7 + #16 Diagnostic views (read-only, admin-only) ──────────────────────
-- These power the weekly review (item #19 in the audit). They are not
-- materialized — they're cheap catalog scans, intended to be queried on
-- demand from the admin console / a Supabase dashboard query.

-- Indexes that have never been scanned since last stats reset.
-- Skip primary keys + unique constraints (we never want to drop those).
CREATE OR REPLACE VIEW public.perf_unused_indexes AS
SELECT
  s.schemaname,
  s.relname        AS table_name,
  s.indexrelname   AS index_name,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  s.idx_scan       AS scans_since_reset
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisunique
  AND NOT i.indisprimary
  AND s.schemaname IN ('public', 'restaurant')
ORDER BY pg_relation_size(s.indexrelid) DESC;

COMMENT ON VIEW public.perf_unused_indexes IS
  'Indexes with zero scans since the last pg_stat reset. Candidates for DROP after confirming usage window covers a full business cycle.';

-- Table bloat estimate — heuristic, not perfect, but flags >20% dead-tuple
-- ratio which is the threshold for considering pg_repack or VACUUM FULL.
CREATE OR REPLACE VIEW public.perf_table_bloat AS
SELECT
  s.schemaname,
  s.relname AS table_name,
  s.n_live_tup AS live_rows,
  s.n_dead_tup AS dead_rows,
  CASE
    WHEN s.n_live_tup + s.n_dead_tup = 0 THEN 0
    ELSE round(100.0 * s.n_dead_tup / (s.n_live_tup + s.n_dead_tup), 1)
  END AS dead_pct,
  pg_size_pretty(pg_total_relation_size(s.relid)) AS total_size,
  s.last_autovacuum,
  s.last_autoanalyze
FROM pg_stat_user_tables s
WHERE s.schemaname IN ('public', 'restaurant')
ORDER BY s.n_dead_tup DESC;

COMMENT ON VIEW public.perf_table_bloat IS
  'Per-table live/dead tuple ratio. >20% dead_pct on a hot table means autovacuum is falling behind — tune scale factors (see 0137) or schedule manual VACUUM.';

-- Restrict to service_role only — these views expose every table + index
-- name in the public/restaurant schemas. Granting to `authenticated` would
-- leak schema layout to every logged-in talent/HM. Admin dashboard reads
-- via Edge Function (service role) instead.
--
-- NOTE: Supabase auto-grants ALL privileges on every new public-schema
-- object to anon + authenticated via default privileges. Must REVOKE first
-- or those grants override our intent (same fix pattern as the 2026-05-06
-- security advisor sweep on ai_chat_usage_daily / match_queue_stats).
REVOKE ALL ON public.perf_unused_indexes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.perf_table_bloat    FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.perf_unused_indexes TO service_role;
GRANT SELECT ON public.perf_table_bloat    TO service_role;
