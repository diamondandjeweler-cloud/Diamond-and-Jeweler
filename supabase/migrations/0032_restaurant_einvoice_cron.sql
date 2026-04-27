-- ============================================================
-- Restaurant Phase 5 — MyInvois cron schedules
--   * myinvois-retry every 2 minutes (sweeps einvoice_due_for_retry)
--   * eod consolidated B2C nightly at 23:30 MYT (= 15:30 UTC)
-- Mirrors the secret pattern from 0024_restaurant_phase3_cron.sql
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent re-schedule: cron.schedule replaces existing job by same name
select cron.schedule(
  'restaurant-einvoice-retry-2m',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
           || '/functions/v1/myinvois-retry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'restaurant-einvoice-eod-consolidated-2330mt',
  '30 15 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
           || '/functions/v1/myinvois-submit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('mode', 'eod_consolidated', 'date', to_char(current_date, 'YYYY-MM-DD')),
    timeout_milliseconds := 300000
  );
  $$
);
