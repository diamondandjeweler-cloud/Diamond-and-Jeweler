-- Migration 0170: Retention purge for request_dedup
-- ============================================================================
-- The request_dedup table (0165) is a request-level idempotency store for the
-- money-path POSTs. Every de-duped request INSERTs a row, but 0165 deliberately
-- DEFERRED the cleanup cron ("There is no cron job here on purpose … a periodic
-- purge can be added later once volume warrants it"). Rows carry a 24h
-- `expires_at`; `withIdempotency` opportunistically ignores expired rows on
-- read, but nothing ever deletes them, so the table grows forever and bloats
-- both the heap and idx_request_dedup_expires_at.
--
-- This adds the deferred daily purge, exactly as 0165 sketched:
--     delete from public.request_dedup where expires_at < now();
-- Only already-expired rows (past their 24h window) are removed, so a live
-- idempotency key is never dropped early.
--
-- Everything here is additive + idempotent + re-runnable:
--   • the cron registration unschedules-if-exists before (re)scheduling, the
--     same DO-block idiom used in 0164 (and 0059 / 0134 / 0135 / 0136 / 0151 /
--     0160), including checking cron.job existence before scheduling.
-- ============================================================================

-- ── Daily purge of expired request_dedup rows (daily via pg_cron) ───────────

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dnj-purge-request-dedup-daily') then
    perform cron.unschedule('dnj-purge-request-dedup-daily');
  end if;
  perform cron.schedule(
    'dnj-purge-request-dedup-daily',
    '20 3 * * *',   -- daily at 03:20 UTC (11:20 MYT), just after the outbox purge window
    $job$
      delete from public.request_dedup
      where expires_at < now();
    $job$
  );
end $$;
