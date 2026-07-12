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

-- ============================================================================
-- B4 HARDENING — make outbox delivery AT-MOST-ONCE-OBSERVABLE.
--
-- Review finding (notify/index.ts): if `record_notification_attempt` fails
-- AFTER a successful Resend send, the row was left mid-flight. A retry loop
-- that recovers stranded rows would then re-fire `notify` and DUPLICATE the
-- email. This section rebuilds the outbox state machine so that:
--
--   * The retry path CLAIMS a row (status -> 'sending') and SPENDS one attempt
--     BEFORE `notify` re-hits Resend. Two cron ticks can therefore never both
--     send the same row (FOR UPDATE SKIP LOCKED + the flip), and the number of
--     PHYSICAL sends per row is hard-capped at `max_attempts`.
--   * A successful send stamps `provider_message_id`; on any re-fire `notify`
--     checks that stamp first and SKIPS the resend when the mail already went
--     out — true de-dupe for the common "send ok, bookkeeping write lost" case.
--   * Rows that exhaust their attempts while still in-flight are retired to the
--     terminal 'sent_unconfirmed' state (we believe the mail went out but could
--     not confirm it) instead of being retried forever.
--
-- All changes are additive and idempotent (safe to re-apply). The RPC
-- signatures + return shapes are UNCHANGED (CREATE OR REPLACE, no DROP), so the
-- existing `notify` / `notification-retry` callers keep working.
-- ============================================================================

-- New bookkeeping columns (additive).
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS claimed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

-- Widen the status domain with 'sending' (claimed, in-flight) and
-- 'sent_unconfirmed' (attempts exhausted mid-flight — probably delivered, not
-- resent). DROP-then-ADD keeps this re-appliable; the new set is a superset.
ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_status_check;
ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_status_check
  CHECK (status IN ('pending','sending','sent','failed','skipped','sent_unconfirmed'));

-- Index the in-flight rows so the stale-recovery scan stays cheap.
CREATE INDEX IF NOT EXISTS idx_notification_outbox_inflight
  ON public.notification_outbox (claimed_at)
  WHERE status IN ('pending','sending');

-- ---------------------------------------------------------------------------
-- record_notification_attempt (hardened) — SAME 3-arg signature/return (0085).
--   * Idempotent: a no-op once the row is already terminal (a re-fire that
--     found the mail already sent, or a duplicate call, cannot flip it back).
--   * Does NOT double-count an attempt already spent by the claim ('sending').
--   * Caps at max_attempts → terminal 'failed' with next_retry_at = NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_notification_attempt(
  p_outbox_id UUID,
  p_success   BOOLEAN,
  p_error     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_status  TEXT;
  v_count   INT;
  v_max     INT;
  v_attempt INT;
  v_next_at TIMESTAMPTZ;
BEGIN
  SELECT status, attempt_count, max_attempts
    INTO v_status, v_count, v_max
  FROM public.notification_outbox
  WHERE id = p_outbox_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Only an in-flight row can transition. Terminal rows (sent / failed /
  -- skipped / sent_unconfirmed) are left untouched, so calling this twice — or
  -- after a de-duped skip — is safe.
  IF v_status NOT IN ('pending','sending') THEN
    RETURN;
  END IF;

  -- claim_notification_retry_batch increments attempt_count when it flips a row
  -- to 'sending', so a 'sending' row has ALREADY spent this attempt. A fresh
  -- 'pending' row (first, un-claimed send) spends the attempt here.
  v_attempt := v_count + CASE WHEN v_status = 'pending' THEN 1 ELSE 0 END;

  IF p_success THEN
    UPDATE public.notification_outbox
    SET status        = 'sent',
        sent_at       = now(),
        attempt_count = v_attempt,
        last_error    = NULL,
        next_retry_at = NULL
    WHERE id = p_outbox_id;
  ELSE
    -- Backoff: attempt 1 fail → +1m, 2 → +5m, at/over the cap → terminal.
    v_next_at := CASE
      WHEN v_attempt >= v_max THEN NULL
      WHEN v_attempt = 1       THEN now() + interval '1 minute'
      WHEN v_attempt = 2       THEN now() + interval '5 minutes'
      ELSE                          now() + interval '5 minutes'
    END;
    UPDATE public.notification_outbox
    SET status        = 'failed',
        attempt_count = v_attempt,
        last_error    = p_error,
        next_retry_at = v_next_at
    WHERE id = p_outbox_id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.record_notification_attempt(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_notification_attempt(UUID, BOOLEAN, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- claim_notification_retry_batch (hardened) — SAME signature/return (0085).
--   Step 1 retires in-flight rows that have exhausted their attempts to the
--          terminal 'sent_unconfirmed' state so they neither retry nor dangle.
--   Step 2 atomically claims a due batch — failed rows past their backoff AND
--          stranded in-flight rows (a send whose bookkeeping never landed) —
--          flipping each to 'sending', SPENDING one attempt, stamping
--          claimed_at. FOR UPDATE SKIP LOCKED keeps concurrent ticks disjoint.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_notification_retry_batch(
  p_batch_size INT DEFAULT 20
)
RETURNS TABLE (
  id            UUID,
  user_id       UUID,
  notify_type   TEXT,
  payload       JSONB,
  channel       TEXT,
  attempt_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Step 1 — retire exhausted in-flight rows so they neither retry nor dangle.
  -- If a provider_message_id was stamped we KNOW the mail went out → 'sent';
  -- otherwise 'sent_unconfirmed' == "most likely went out but the confirming
  -- write was lost". Either way we intentionally do NOT resend.
  UPDATE public.notification_outbox o
  SET status  = CASE WHEN o.provider_message_id IS NOT NULL
                     THEN 'sent' ELSE 'sent_unconfirmed' END,
      sent_at = COALESCE(o.sent_at, now())
  WHERE o.status IN ('pending','sending')
    AND o.attempt_count >= o.max_attempts
    AND o.updated_at <= now() - interval '2 minutes';

  -- Step 2 — claim the due batch.
  RETURN QUERY
  WITH due AS (
    SELECT o.id
    FROM public.notification_outbox o
    WHERE o.attempt_count < o.max_attempts
      AND (
            -- failed rows whose backoff has elapsed
            (o.status = 'failed'
              AND (o.next_retry_at IS NULL OR o.next_retry_at <= now()))
            -- retry-claimed rows whose sender crashed before recording (stale)
         OR (o.status = 'sending'
              AND (o.claimed_at IS NULL OR o.claimed_at <= now() - interval '2 minutes'))
            -- fresh sends whose bookkeeping never landed (stranded 'pending')
         OR (o.status = 'pending'
              AND o.updated_at <= now() - interval '5 minutes')
          )
    ORDER BY o.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_outbox o
  SET status        = 'sending',
      attempt_count = o.attempt_count + 1,
      claimed_at    = now(),
      next_retry_at = NULL
  FROM due
  WHERE o.id = due.id
  RETURNING o.id, o.user_id, o.notify_type, o.payload, o.channel, o.attempt_count;
END $$;

REVOKE ALL ON FUNCTION public.claim_notification_retry_batch(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_retry_batch(INT) TO service_role;

COMMENT ON COLUMN public.notification_outbox.provider_message_id
  IS 'Resend message id from the successful send; presence means the mail went out (de-dupe guard on retry re-fire).';
COMMENT ON COLUMN public.notification_outbox.claimed_at
  IS 'When claim_notification_retry_batch last flipped this row to sending; drives stale-in-flight recovery.';

-- ============================================================================
-- Cron: schedule the notification-retry drain every minute.
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
