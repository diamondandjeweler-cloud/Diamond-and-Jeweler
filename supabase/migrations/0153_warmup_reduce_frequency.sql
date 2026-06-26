-- ============================================================
-- 0153 — Reduce edge-function warmup frequency (4m → 15m)   [AUDIT D6]
--
-- 0108 pings ~11 hot click-path functions every 4 minutes
-- (11 × 15/hr × 24 = 3,960 calls/day) to keep their Deno workers
-- warm. At ~0 users on the nano compute tier that is almost all
-- of the function-invocation load and exists purely to shave a
-- one-time cold start. Drop the cadence to every 15 minutes
-- (11 × 4/hr × 24 = 1,056 calls/day, -73%). The same functions
-- stay warmed — only the interval changes.
--
-- cron.schedule(jobname, ...) upserts by name, and these job names
-- ('warmup-' || fn) are exactly the ones 0108 created, so this
-- updates each existing schedule in place. Idempotent: re-applying
-- just re-sets the same 15-minute cadence.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_fns text[] := array[
    'award-points',
    'buy-points',
    'init-consult-booking',
    'interview-action',
    'invite-hm',
    'link-hm',
    'redeem-points',
    'submit-feedback',
    'submit-monthly-boost',
    'unlock-extra-match',
    'urgent-priority-search'
  ];
  v_fn       text;
  v_job_name text;
begin
  foreach v_fn in array v_fns loop
    v_job_name := 'warmup-' || v_fn;

    if exists (select 1 from cron.job where jobname = v_job_name) then
      perform cron.unschedule(v_job_name);
    end if;

    perform cron.schedule(
      v_job_name,
      '*/15 * * * *',
      format($cron$
        select net.http_get(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
                 || '/functions/v1/%s',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
          ),
          timeout_milliseconds := 8000
        );
      $cron$, v_fn)
    );
  end loop;
end $$;
