-- Migration 0170 (STAGED): Interim retention purge for match_history
-- ============================================================================
-- WHAT THIS DOES
--   public.match_history (0001) is an append-only audit trail: every match
--   generate / refresh / expire / manual-admin action inserts a row and NOTHING
--   ever deletes one. At scale this grows without bound (~1 TB/month projected),
--   bloating the heap, its indexes, and autovacuum — with no operational value
--   for very old audit rows.
--
--   This adds a daily pg_cron job 'bole-purge-match-history-daily' that DELETEs
--   rows older than 90 days from public.match_history. It mirrors the idempotent
--   unschedule-if-exists -> cron.schedule DO-block idiom from 0151 / 0164, and
--   the interim-DELETE retention precedent from 0164 (which explicitly deferred
--   match_history).
--
-- 90 DAYS IS A DEFAULT — THE OWNER SHOULD CONFIRM IT.
--   90 days is a conservative starting point, not a compliance-derived value.
--   0164 notes match_history retention is "TBD on cutover ... align with
--   audit_log (730d) unless product/compliance specifies shorter." If this audit
--   trail must be retained for 2 years for compliance, RAISE the interval to
--   '730 days' (or whatever product/compliance dictates) BEFORE applying.
--
-- THIS IS THE INTERIM (SAFE) OPTION.
--   A DELETE-based purge is non-destructive to schema and re-runnable, but it
--   churns the heap + the idx_match_history_role index and leaves dead tuples
--   for autovacuum to reclaim. The SCALE option for very high volume is full
--   monthly RANGE partitioning by created_at with an auto-DROP-old-partition job,
--   so retention becomes a metadata-only DROP TABLE instead of a heap-churning
--   DELETE. That cutover is a DESTRUCTIVE table rewrite and is intentionally NOT
--   done here — see the commented sketch at the bottom of this file and the
--   PARTITION PLAN in 0164.
--
-- ****************************************************************************
-- ** PROVE ON A SHADOW DB BEFORE APPLYING TO LIVE.                          **
-- ** PICK THE NEXT FREE MIGRATION NUMBER AT APPLY TIME — 0170 MAY COLLIDE;  **
-- ** THIS REPO HAS DUPLICATE NUMERIC PREFIXES. RENUMBER BEFORE PROMOTING    **
-- ** OUT OF supabase/staged-migrations/.                                    **
-- ****************************************************************************
--
-- IDEMPOTENT: safe to re-apply. The cron registration unschedules-if-exists
-- before (re)scheduling; the extension guard is create-if-not-exists.
-- ============================================================================

create extension if not exists pg_cron;

-- ── 90-day retention purge of old match_history audit rows (daily via pg_cron) ──
-- created_at is the row's insertion timestamp (0001_schema.sql:
--   match_history.created_at timestamptz not null default now()).

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bole-purge-match-history-daily') then
    perform cron.unschedule('bole-purge-match-history-daily');
  end if;
  -- The inner job body is dollar-quoted with a job-specific tag so its
  -- delimiters never collide with this outer do-block (0151 idiom).
  perform cron.schedule(
    'bole-purge-match-history-daily',
    '0 3 * * *',   -- daily at 03:00 UTC (11:00 MYT)
    $job$
      delete from public.match_history
      where created_at < now() - interval '90 days';
    $job$
  );
end $$;


-- ============================================================================
-- FUTURE REFERENCE — FULL RANGE-PARTITIONING (NOT part of this migration)
-- ----------------------------------------------------------------------------
-- The scale endgame for match_history is the same as 0164's deferred plan for
-- audit_log / notification_outbox: convert this append-mostly heap into a table
-- RANGE-partitioned by created_at, so retention is a metadata-only
-- DETACH/DROP PARTITION instead of the interim DELETE above.
--
-- This is DESTRUCTIVE (rename + create partitioned parent + copy rows + swap),
-- must be rehearsed on a STAGING SNAPSHOT, and run in a controlled maintenance
-- window — never blind-applied via the migration runner. Sketch only:
--
--   1. Rename the live table out of the way:
--        ALTER TABLE public.match_history RENAME TO match_history_legacy;
--
--   2. Create the partitioned parent with the SAME columns/constraints:
--        CREATE TABLE public.match_history (LIKE public.match_history_legacy
--          INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)
--        PARTITION BY RANGE (created_at);
--      Re-apply RLS / FORCE ROW LEVEL SECURITY / policies / grants and the
--      role_id / talent_id FKs — they do NOT carry across the LIKE. NOTE: a
--      partitioned parent's PRIMARY KEY must include the partition key, so the
--      pkey becomes (id, created_at) rather than (id) alone.
--
--   3. Pre-create monthly partitions, e.g.:
--        CREATE TABLE public.match_history_2026_07 PARTITION OF public.match_history
--          FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
--      Manage going forward with EITHER:
--        (a) pg_partman (partman.create_parent + a partman maintenance cron), OR
--        (b) a small pre-create cron that adds next month's partition ahead of
--            time, using the same unschedule-if-exists DO-block idiom as above.
--
--   4. Backfill: INSERT … SELECT (or attach) rows from match_history_legacy into
--      the new partitions in batches, then DROP TABLE match_history_legacy.
--
--   5. Retention then becomes a metadata operation replacing the DELETE job:
--        DROP TABLE public.match_history_2026_01;   -- past the retention window
--      driven by the SAME pg_cron schedule, replacing the interim DELETE body
--      registered by this migration.
-- ============================================================================
