-- 0194_notification_retry_cron.sql
-- ============================================================================
-- B4 — Wire the notification_outbox retry loop (closes failure-mode F3).
--
-- 0085_notification_outbox.sql created the durable outbox plus three RPCs
--   (enqueue_notification / claim_notification_retry_batch /
--    record_notification_attempt)
-- but shipped with ZERO callers, so a transient Resend failure still meant the
-- email was silently lost. Two things wire it up:
--   1. The `notify` edge fn now enqueues an outbox row before an email attempt
--      and records the attempt outcome (see supabase/functions/notify).
--   2. A new `notification-retry` edge fn claims the due-for-retry batch and
--      re-fires `notify` for each (see supabase/functions/notification-retry).
-- This migration schedules that retry fn every minute, mirroring the
-- net.http_post + Vault pattern already used by
-- bole-process-match-queue-every-1m (migration 0151).
--
-- Requires the existing Vault secrets `supabase_url` and `service_role_key`
-- (seeded in 0005_cron.sql) and the `notification-retry` edge fn deployed with
-- verify_jwt=false (config.toml). Idempotent: safe to re-apply.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bole-notification-retry-every-1m') then
    perform cron.unschedule('bole-notification-retry-every-1m');
  end if;
  -- Inner job body dollar-quoted with a unique tag ($job$) so its delimiters
  -- never collide with this outer do-block.
  perform cron.schedule(
    'bole-notification-retry-every-1m',
    '* * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
             || '/functions/v1/notification-retry',
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
