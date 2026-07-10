-- ============================================================================
-- 0178 — pipeline_health(): per-job liveness, un-mask a single stalled job (AUDIT #12)
-- ============================================================================
-- 0161/0163's pipeline_health() derives `healthy` from max(last_run_at) across
-- ALL jobs in cron_heartbeat. process-match-queue heartbeats every minute, but
-- data-retention and match-expire run far less often — so a recent run of EITHER
-- of those keeps the aggregate max fresh and reports healthy=true for up to 10
-- minutes AFTER the money-critical process-match-queue has actually died. That is
-- exactly the "a single stalled job is masked because health is aggregate" gap
-- (audit #12): the 27-day silent outage that motivated 0161 was process-match-
-- queue dying, and the aggregate signal can hide precisely that.
--
-- FIX (minimal, preserves ALL of 0163):
--   * `healthy` + `last_heartbeat_age_seconds` now track the process-match-queue
--     heartbeat SPECIFICALLY, so the external monitor pages the moment the money
--     pipeline stalls, regardless of the other jobs' schedules.
--   * NEW `jobs` object: {job_name: {age_seconds}} for every heartbeat row, so the
--     external monitor / admin can SEE each job's staleness (visibility). Alerting
--     on the less-frequent jobs stays with cron_deadman_check (0154, 36h in-app).
--
-- In normal operation process-match-queue heartbeats every minute, so `healthy`
-- stays true exactly as before; the only behaviour change is that a dead queue can
-- no longer be masked by a recent data-retention/match-expire run. Additive +
-- back-compatible: every field 0163 returned is preserved; only `jobs` is added.
-- SECURITY DEFINER + search_path + anon/authenticated grants unchanged. No PII
-- (counts + coarse ages only). ROLLBACK = re-apply 0163.
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
  ),
  -- The money-critical realtime job. Track its OWN heartbeat (not the cross-job
  -- max) so `healthy` reflects the match pipeline specifically.
  queue as (
    select last_run_at
      from public.cron_heartbeat
     where job_name = 'process-match-queue'
  )
  select jsonb_build_object(
    'healthy',
      coalesce((select last_run_at from queue) > now() - interval '10 minutes', false),
    'last_heartbeat_age_seconds',
      (select case when last_run_at is null then null
              else floor(extract(epoch from (now() - last_run_at)))::int end
       from queue),
    'recent_done',   (select done_ct from recent),
    'recent_failed', (select failed_ct from recent),
    'recent_failure_ratio',
      (select case when (done_ct + failed_ct) = 0 then null
              else round(failed_ct::numeric / (done_ct + failed_ct), 4) end
       from recent),
    -- Per-job heartbeat ages — un-masks a single stalled job for the monitor/admin.
    'jobs',
      coalesce(
        (select jsonb_object_agg(job_name,
                  jsonb_build_object(
                    'age_seconds', floor(extract(epoch from (now() - last_run_at)))::int))
         from public.cron_heartbeat),
        '{}'::jsonb),
    'checked_at', now()
  );
$$;

revoke all on function public.pipeline_health() from public;
grant execute on function public.pipeline_health() to anon, authenticated;

notify pgrst, 'reload schema';
