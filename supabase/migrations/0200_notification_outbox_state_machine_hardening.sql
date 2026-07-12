-- 0200_notification_outbox_state_machine_hardening.sql
-- ============================================================================
-- B4 HARDENING — make outbox delivery AT-MOST-ONCE-OBSERVABLE.
--
-- Split out of 0194 into this fresh migration. 0194 was ALREADY shipped (base
-- commit 0ad858c) as a cron-only migration; appending the hardening into it in
-- place would be a deploy-integrity landmine — a migration runner tracks 0194 by
-- filename/checksum and will NOT re-run it if 0194 had ever been applied in its
-- original cron-only form, silently skipping the hardened RPCs + new columns the
-- newly deployed notify / notification-retry edge fns depend on. Landing the
-- hardening as its own next-free migration guarantees it applies regardless of
-- whether 0194 was already run, and keeps every migration hash stable.
--
-- Review finding (notify/index.ts): if `record_notification_attempt` fails
-- AFTER a successful Resend send, the row was left mid-flight. A retry loop
-- that recovers stranded rows would then re-fire `notify` and DUPLICATE the
-- email. This migration rebuilds the outbox state machine so that:
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
--
-- DEPLOY ORDER: apply this migration (with / in the same push as 0194) BEFORE
-- deploying the modified `notify` and new `notification-retry` edge fns, since
-- those fns rely on the claim-first / attempt-spend / provider_message_id
-- semantics below. 0194's cron only *schedules* notification-retry; it does not
-- depend on these columns, so the numeric order (0194 then 0200) is safe.
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
            -- retry-claimed rows whose sender crashed before recording (stale).
            -- The window MUST exceed the worst-case wall-clock of a single notify
            -- re-fire: notify's resend.emails.send() (notify/index.ts) has NO
            -- request timeout, so a hung/slow Resend connection stays in-flight
            -- until the Supabase edge wall-clock ceiling (minutes, up to ~400s)
            -- kills the worker. At 2 min this scan could re-claim a row whose
            -- FIRST re-fire is still mid-send (provider_message_id not yet stamped,
            -- so the notify de-dupe guard misses) and send a DUPLICATE email
            -- (notifications-2). 10 min sits safely above that ceiling: by re-claim
            -- the first worker is guaranteed dead, and any send it completed has
            -- stamped provider_message_id and is caught by the de-dupe guard. The
            -- only cost is a slower recovery of genuinely-stranded rows, which is a
            -- rare backstop (notification-retry records failures synchronously on
            -- any non-2xx / thrown re-fire, so stranding needs the retry worker
            -- itself to crash mid-loop).
         OR (o.status = 'sending'
              AND (o.claimed_at IS NULL OR o.claimed_at <= now() - interval '10 minutes'))
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
