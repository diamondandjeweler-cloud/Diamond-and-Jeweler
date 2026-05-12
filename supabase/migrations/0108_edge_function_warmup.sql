-- ============================================================
-- 0108 — Edge Function warmup
--
-- Why: Supabase Edge Functions cold-start in ~1.5–3s after the Deno
-- worker is evicted. For low-traffic functions that the user clicks on
-- (interview-action, urgent-priority-search, unlock-extra-match,
-- award-points, submit-feedback, link-hm, init-consult-booking),
-- that cold start is felt as "the button took 3 seconds to respond."
--
-- This migration schedules a pg_cron job every 4 minutes that pings
-- each hot user-facing function with a no-op GET request. The function
-- rejects GET with 405 — but the Deno worker is loaded into memory by
-- the request, which is the whole point. The next real user click hits
-- a warm worker and returns in <200ms instead of 1500-3000ms.
--
-- We only warm functions the user hits synchronously from the UI.
-- Background-only functions (match-expire, data-retention,
-- process-match-queue, etc.) don't need this — they're either run by
-- existing crons or by webhooks where latency doesn't matter.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: schedule a 4-minute warmup ping for one function name.
-- Idempotent: drop the old schedule first so re-running this migration
-- on a project that's already had it applied doesn't error.
create or replace function _warmup_schedule_edge_function(fn_name text) returns void
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  v_job_name text := 'warmup-' || fn_name;
begin
  -- Drop any prior schedule under this name so re-applying is safe.
  if exists (select 1 from cron.job where jobname = v_job_name) then
    perform cron.unschedule(v_job_name);
  end if;

  perform cron.schedule(
    v_job_name,
    '*/4 * * * *',
    format($cron$
      select net.http_get(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/%s',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        timeout_milliseconds := 8000
      );
    $cron$, fn_name)
  );
end;
$$;

-- Hot click-path functions that need to stay warm.
-- Order is alphabetical for diff-friendliness, not priority.
select _warmup_schedule_edge_function('award-points');
select _warmup_schedule_edge_function('buy-points');
select _warmup_schedule_edge_function('init-consult-booking');
select _warmup_schedule_edge_function('interview-action');
select _warmup_schedule_edge_function('invite-hm');
select _warmup_schedule_edge_function('link-hm');
select _warmup_schedule_edge_function('redeem-points');
select _warmup_schedule_edge_function('submit-feedback');
select _warmup_schedule_edge_function('submit-monthly-boost');
select _warmup_schedule_edge_function('unlock-extra-match');
select _warmup_schedule_edge_function('urgent-priority-search');

-- We keep the helper around so future migrations can add more functions
-- with a single line — but it could also be dropped here if you prefer
-- the schedules to be the only persistent artifact. We leave it.
