-- ============================================================================
-- 0163 — public.pipeline_health(): add a "degraded" signal for partial failure
--
-- WHY: 0161's pipeline_health() only reports the cron→edge HEARTBEAT staleness.
--   A matcher that RUNS on schedule (fresh heartbeat) but FAILS most queue items
--   still reports 'healthy' — the off-platform watchdog would never page on a
--   silently-broken matcher (bad prompt, model outage, schema drift, etc.).
--
-- SIGNAL: match_queue rows reach a terminal state of 'done' (success) or 'failed'
--   (set by fail_match_queue_item once retry_count >= 2; see 0074). Both terminal
--   transitions stamp updated_at, so a recent failure ratio = failed / (done+failed)
--   over the last hour cleanly captures "the matcher is running but mostly failing".
--   /api/health turns a high ratio (with enough volume) into a 'degraded' 503.
--
-- This RETURNS EVERYTHING 0161 returned (so health.ts keeps working) PLUS three
--   new coarse, non-sensitive fields: recent_done, recent_failed, recent_failure_ratio
--   — only counts + a ratio, no rows or PII, so it stays safe to grant to anon.
--   Same SECURITY DEFINER + search_path hardening + GRANTs as 0161.
-- ============================================================================

create or replace function public.pipeline_health()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  with recent as (
    select
      count(*) filter (where status = 'done')   as done_ct,
      count(*) filter (where status = 'failed')  as failed_ct
    from public.match_queue
    where status in ('done', 'failed')
      and updated_at > now() - interval '1 hour'
  )
  select jsonb_build_object(
    'healthy',
      coalesce(
        (select max(last_run_at) from public.cron_heartbeat) > now() - interval '10 minutes',
        false),
    'last_heartbeat_age_seconds',
      (select case when max(last_run_at) is null then null
              else floor(extract(epoch from (now() - max(last_run_at))))::int end
       from public.cron_heartbeat),
    'recent_done',   (select done_ct from recent),
    'recent_failed', (select failed_ct from recent),
    'recent_failure_ratio',
      (select case when (done_ct + failed_ct) = 0 then null
              else round(failed_ct::numeric / (done_ct + failed_ct), 4) end
       from recent),
    'checked_at', now()
  );
$$;

revoke all on function public.pipeline_health() from public;
grant execute on function public.pipeline_health() to anon, authenticated;

notify pgrst, 'reload schema';
