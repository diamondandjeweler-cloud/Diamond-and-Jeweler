-- ============================================================
-- BoLe Platform — Scheduled Jobs (Milestone 1)
-- pg_cron + pg_net + Supabase Vault for calling Edge Functions on schedule.
--
-- IMPORTANT: This file creates the schedule DEFINITIONS only.
-- Before the cron jobs can run successfully you must populate Vault secrets:
--
--   select vault.create_secret('https://YOUR-PROJECT.supabase.co',  'supabase_url');
--   select vault.create_secret('YOUR-SERVICE-ROLE-KEY',             'service_role_key');
--
-- Run those two statements AFTER creating the Supabase project, in the SQL editor,
-- substituting your project URL and service role key. Do NOT commit those secrets.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Ensure cron runs are owned by postgres (Supabase default). The Edge Functions
-- being called do their own authorization checks (see Milestone 3).

-- ---------- match-expire: every 6 hours ----------
-- Flips stale matches to 'expired', logs to match_history, and (optionally) kicks
-- off a refresh-generation pass subject to refresh_limit.

select
  cron.schedule(
    'bole-match-expire-every-6h',
    '0 */6 * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
             || '/functions/v1/match-expire',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $$
  );

-- ---------- data-retention: daily at 02:00 Kuala Lumpur (UTC+8) = 18:00 UTC ----------
-- Purges DOB ciphertext and IC files 30 days after a 'deletion' DSR is completed.

select
  cron.schedule(
    'bole-data-retention-daily',
    '0 18 * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
             || '/functions/v1/data-retention',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $$
  );
