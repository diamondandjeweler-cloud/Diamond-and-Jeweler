-- ============================================================
-- 0082 — Schedule retry-stuck-extractions backstop
--
-- Runs every 5 minutes and picks up talents stuck in extraction_status
-- 'pending'/'processing' for >10 min — typically dropped fire-and-forget
-- enqueues from the onboarding page, or Edge Function crashes mid-flight.
-- ============================================================

select
  cron.schedule(
    'bole-retry-stuck-extractions-5min',
    '*/5 * * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
             || '/functions/v1/retry-stuck-extractions',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    $$
  );
