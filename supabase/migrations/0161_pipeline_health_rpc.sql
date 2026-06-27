-- ============================================================================
-- 0161 — public.pipeline_health(): a safe liveness signal for an EXTERNAL monitor
--
-- WHY: the prod async match pipeline was dead for ~27 days (cron→edge calls 403ing
--   after a service-role-key rotation left the Vault secret stale) and NOBODY
--   NOTICED — the only alert was in-app, which no logged-out human sees. The fix
--   for "nobody noticed" is an off-platform watchdog. This RPC exposes a tiny,
--   non-sensitive health signal that /api/health turns into a 200/503 an external
--   monitor (UptimeRobot, cron-job.org, Better Uptime — all have free tiers) can
--   poll and PAGE on.
--
-- SIGNAL: process-match-queue heartbeats into public.cron_heartbeat every minute
--   when the pipeline is alive. If the most recent heartbeat is older than 10 min,
--   the cron→edge path is broken (auth/Vault/pg_cron) — exactly the dead-pipeline
--   condition. Returns ONLY a boolean + a coarse age (no rows, counts, or PII), so
--   it is safe to grant to anon.
-- ============================================================================

create or replace function public.pipeline_health()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select jsonb_build_object(
    'healthy',
      coalesce(
        (select max(last_run_at) from public.cron_heartbeat) > now() - interval '10 minutes',
        false),
    'last_heartbeat_age_seconds',
      (select case when max(last_run_at) is null then null
              else floor(extract(epoch from (now() - max(last_run_at))))::int end
       from public.cron_heartbeat),
    'checked_at', now()
  );
$$;

revoke all on function public.pipeline_health() from public;
grant execute on function public.pipeline_health() to anon, authenticated;

notify pgrst, 'reload schema';
