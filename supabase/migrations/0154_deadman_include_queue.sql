-- ============================================================
-- 0154 — Dead-man check also monitors process-match-queue   [AUDIT scan #7/#10]
--
-- 0151 schedules process-match-queue every minute and the worker upserts a
-- 'process-match-queue' heartbeat (process-match-queue/index.ts), but
-- cron_deadman_check() only inspected ['data-retention','match-expire']. So a
-- silent stall of the queue worker (e.g. a missing/rotated service_role Vault
-- secret — exactly the failure mode 0151's header calls out) raised no admin
-- alert even though the heartbeat plumbing already exists. This adds
-- 'process-match-queue' to the monitored set.
--
-- The queue runs every minute, so the existing 36-hour staleness window is
-- amply tolerant and needs no tuning. CREATE OR REPLACE — idempotent, no data
-- change. Body is identical to 0151 except for the v_jobs array.
-- ============================================================

create or replace function public.cron_deadman_check()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $f$
declare
  v_jobs   text[] := array['data-retention', 'match-expire', 'process-match-queue'];
  v_job    text;
  v_last   timestamptz;
  v_stale  text[] := array[]::text[];
  v_body   text;
begin
  foreach v_job in array v_jobs loop
    select last_run_at into v_last
      from public.cron_heartbeat
     where job_name = v_job;

    if v_last is null or v_last < now() - interval '36 hours' then
      v_stale := array_append(v_stale, v_job);
    end if;
  end loop;

  if array_length(v_stale, 1) is null then
    return;
  end if;

  v_body := 'Scheduled job(s) have not reported a heartbeat in over 36 hours: '
            || array_to_string(v_stale, ', ')
            || '. They may be silently failing (e.g. a missing service credential). Please investigate.';

  -- Notify every active admin (mirrors is_admin(): role='admin', not banned).
  insert into public.notifications (user_id, type, channel, subject, body, data)
  select p.id,
         'cron_deadman',
         'in_app',
         'Scheduled job not running',
         v_body,
         jsonb_build_object('stale_jobs', to_jsonb(v_stale))
    from public.profiles p
   where p.role = 'admin'
     and p.is_banned = false;
end
$f$;

revoke execute on function public.cron_deadman_check() from public;
grant execute on function public.cron_deadman_check() to service_role;
