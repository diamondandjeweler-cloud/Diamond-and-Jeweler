-- ============================================================
-- Phase 2 — scheduled jobs.
-- Monthly fortune refresher → invokes the `monthly-fortune` Edge
-- Function on the 1st of each month at 09:00 MYT (01:00 UTC).
--
-- Vault secrets required (already set for milestone 1 cron jobs):
--   - supabase_url
--   - service_role_key
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select
  cron.schedule(
    'bole-monthly-fortune-1st-09mt',
    '0 1 1 * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
             || '/functions/v1/monthly-fortune',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    $$
  );
