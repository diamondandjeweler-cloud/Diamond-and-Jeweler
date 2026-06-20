-- ============================================================
-- BoLe Platform — Schedule process-match-queue + cron heartbeat / dead-man check
--
-- Fixes: process-match-queue was invoked by NOTHING (its docstring claimed a
-- cron ran it, but no cron existed). Also, every cron reads auth from Vault and
-- never inspects the net.http_post status, so a missing Vault secret silently
-- turns each cron into a no-op. This adds:
--   (1) a 1-minute schedule for process-match-queue (mirrors match-expire-every-6h),
--   (2) a public.cron_heartbeat table that edge functions upsert on each run,
--   (3) a daily dead-man check that notifies admins if the data-retention or
--       match-expire heartbeats go stale (missing or older than 36 hours).
--
-- Requires the existing Vault secrets `supabase_url` and `service_role_key`
-- (see 0005_cron.sql). Idempotent: safe to re-apply.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- (1) process-match-queue: every 1 minute ----------
-- Mirrors the net.http_post + Vault pattern from bole-match-expire-every-6h.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bole-process-match-queue-every-1m') then
    perform cron.unschedule('bole-process-match-queue-every-1m');
  end if;
  -- The inner job body is dollar-quoted with the job tag (not the default
  -- tag) so its delimiters never collide with this outer do-block.
  perform cron.schedule(
    'bole-process-match-queue-every-1m',
    '* * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
             || '/functions/v1/process-match-queue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );
end $$;

-- ---------- (2) cron_heartbeat table ----------
-- Edge functions upsert (job_name, last_run_at = now()) at the end of each run.
-- A missing/stale row is what the dead-man check looks for.

create table if not exists public.cron_heartbeat (
  job_name    text primary key,
  last_run_at timestamptz not null default now(),
  note        text
);

alter table public.cron_heartbeat enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cron_heartbeat'
      and policyname = 'cron_heartbeat_select_admin'
  ) then
    create policy cron_heartbeat_select_admin on public.cron_heartbeat
      for select using (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cron_heartbeat'
      and policyname = 'cron_heartbeat_all_service_role'
  ) then
    create policy cron_heartbeat_all_service_role on public.cron_heartbeat
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ---------- (3) dead-man check ----------
-- SECURITY DEFINER so it can read cron_heartbeat (RLS) and insert notifications
-- for every active admin. Fires an in-app notification if the data-retention or
-- match-expire heartbeat is missing or older than 36 hours.

create or replace function public.cron_deadman_check()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $f$
declare
  v_jobs   text[] := array['data-retention', 'match-expire'];
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

-- Schedule the dead-man check daily (idempotent).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'bole-cron-deadman-daily') then
    perform cron.unschedule('bole-cron-deadman-daily');
  end if;
  perform cron.schedule(
    'bole-cron-deadman-daily',
    '0 1 * * *',
    $cron$select public.cron_deadman_check();$cron$
  );
end $$;
