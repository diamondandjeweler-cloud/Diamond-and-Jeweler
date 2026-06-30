-- Migration 0164: Retention purge for notification_outbox
-- ============================================================================
-- The notification_outbox table (0085) is a durable retry queue for `notify`
-- sends. Every enqueue/attempt writes or mutates a row, but NOTHING ever
-- deletes terminal rows — so the table grows forever. Sent/skipped/exhausted
-- rows have no operational value once they're a few weeks old; they only bloat
-- the heap and the partial retry index, and slow autovacuum (tuned in 0137 #20).
--
-- This mirrors the audit_log retention purge added in 0063, but uses a SHORTER
-- interval: audit_log is a 2-year compliance record, whereas the outbox is an
-- operational queue. 60 days is well beyond the longest backoff window
-- (record_notification_attempt tops out at +5 minutes) and any plausible
-- support / debugging look-back, while keeping the table small.
--
-- Only TERMINAL rows are purged:
--   • status = 'sent'    — delivered, nothing more to do
--   • status = 'skipped' — intentionally not sent
--   • status = 'failed' AND attempt_count >= max_attempts — exhausted retries
-- 'pending' rows and 'failed' rows still eligible for retry are NEVER deleted,
-- regardless of age, so an old-but-stuck retry is never silently dropped.
--
-- Everything here is additive + idempotent + re-runnable:
--   • the cron registration unschedules-if-exists before (re)scheduling, the
--     same DO-block idiom used in 0059 / 0134 / 0135 / 0136 / 0151 / 0160.
-- ============================================================================

-- ── 60-day retention purge of terminal outbox rows (daily via pg_cron) ──────

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dnj-purge-notification-outbox-daily') then
    perform cron.unschedule('dnj-purge-notification-outbox-daily');
  end if;
  perform cron.schedule(
    'dnj-purge-notification-outbox-daily',
    '15 3 * * *',   -- daily at 03:15 UTC (11:15 MYT), just after the audit-log purge window
    $job$
      delete from public.notification_outbox
      where created_at < now() - interval '60 days'
        and (
          status in ('sent', 'skipped')
          or (status = 'failed' and attempt_count >= max_attempts)
        );
    $job$
  );
end $$;


-- ============================================================================
-- PARTITION PLAN  (DEFERRED — do NOT execute in this migration)
-- ----------------------------------------------------------------------------
-- Items #17 (0137) + the audit_log 2-year retention (0063) both point at the
-- same end state: the unbounded append-mostly tables (audit_log, match_history,
-- and notification_outbox) should become RANGE-partitioned by created_at so
-- retention is a metadata-only DETACH/DROP PARTITION instead of a heap-churning
-- DELETE that bloats the table and the indexes.
--
-- This is intentionally NOT done here because converting an existing populated
-- heap to a partitioned table is a DESTRUCTIVE, table-rewriting operation
-- (rename + create partitioned parent + copy rows + swap), which must be
-- rehearsed on a STAGING SNAPSHOT and run in a controlled maintenance window —
-- never blind-applied via the migration runner. Documented here so the plan
-- lives next to the interim DELETE-based purge it will eventually replace.
--
-- Target shape (audit_log shown; match_history / notification_outbox identical
-- pattern, keyed on created_at):
--
--   1. Rename the live table out of the way:
--        ALTER TABLE public.audit_log RENAME TO audit_log_legacy;
--
--   2. Create the partitioned parent with the SAME columns/constraints:
--        CREATE TABLE public.audit_log (LIKE public.audit_log_legacy
--          INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)
--        PARTITION BY RANGE (created_at);
--      (re-apply RLS / FORCE ROW LEVEL SECURITY / policies / grants — they do
--       NOT carry across the LIKE.)
--
--   3. Pre-create monthly partitions, e.g.:
--        CREATE TABLE public.audit_log_2026_07 PARTITION OF public.audit_log
--          FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
--      Manage these going forward with EITHER:
--        (a) pg_partman (partman.create_parent + a partman maintenance cron), OR
--        (b) a small pre-create cron that adds next month's partition ahead of
--            time, following the same unschedule-if-exists DO-block idiom used
--            for the purge job above.
--
--   4. Backfill: INSERT … SELECT (or attach) rows from audit_log_legacy into
--      the new partitions, in batches, then DROP TABLE audit_log_legacy.
--
--   5. Retention then becomes a metadata operation instead of the DELETE jobs:
--        DROP TABLE public.audit_log_2024_06;          -- past 730d  (audit_log)
--        DROP TABLE public.notification_outbox_2026_04; -- past 60d   (outbox)
--      driven by the SAME pg_cron schedule, replacing the interim DELETE bodies
--      in 0063 (audit_log) and this migration (notification_outbox).
--
-- Retention intervals to preserve when the partition cutover happens:
--   • audit_log           — 730 days  (2 years, compliance; see 0063)
--   • match_history       — TBD on cutover (audit trail; align with audit_log
--                            unless product/compliance specifies shorter)
--   • notification_outbox —  60 days  (operational queue; this migration)
-- ============================================================================
