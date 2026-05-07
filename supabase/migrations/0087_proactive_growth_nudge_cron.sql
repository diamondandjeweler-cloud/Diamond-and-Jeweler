-- 0087_proactive_growth_nudge_cron.sql
-- ============================================================================
-- Cron entry for Module 4 — proactive monthly growth-opportunity nudge.
--
-- Fires once a month at 09:00 MYT (01:00 UTC) on the 1st. The yearly-fortune
-- refresher (cron 'bole-monthly-fortune-1st-09mt') is scheduled at the same
-- moment but completes within seconds; we run the nudge job 5 minutes later
-- so fortune scores are guaranteed fresh for the eligibility query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotency: drop existing schedule if it was created by an earlier dev run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'bole-proactive-growth-nudge-1st-09mt'
  ) THEN
    PERFORM cron.unschedule('bole-proactive-growth-nudge-1st-09mt');
  END IF;
END $$;

SELECT
  cron.schedule(
    'bole-proactive-growth-nudge-1st-09mt',
    '5 1 1 * *',                                          -- 5 min after fortune cron
    $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
             || '/functions/v1/proactive-job-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 180000
    );
    $$
  );
