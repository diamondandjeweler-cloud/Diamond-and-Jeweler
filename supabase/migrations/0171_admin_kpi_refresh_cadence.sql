-- Migration 0171: cut the admin-KPI refresh cadence from every 2 min to every 15 min
-- ============================================================================
-- The `refresh-admin-kpis-mv` cron (introduced in 0134, fixed in 0160) ran on
-- `*/2 * * * *` — 720 times a day — doing a `refresh materialized view
-- mv_admin_kpis` plus several unfiltered `count(*)` scans over `profiles`
-- (total/banned/ghost) on every tick, whether or not any admin is online. That
-- is a permanent, table-size-linear CPU floor on the (nano/micro) instance.
--
-- 15-minute freshness is ample for an admin KPI dashboard (it is a monitoring
-- surface, not a real-time feed), and this cuts the refresh/scan work ~7.5x.
-- Only the SCHEDULE changes — the refresh + cache-insert command is untouched,
-- so the numbers are identical, just refreshed a little less often.
--
-- Idempotent + re-runnable: alters by the job's current id (looked up by name)
-- and no-ops if the job is absent. Trivially reversible (re-alter to '*/2').
-- ============================================================================

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'refresh-admin-kpis-mv';
  if jid is not null then
    perform cron.alter_job(jid, schedule => '*/15 * * * *');
  end if;
end $$;
