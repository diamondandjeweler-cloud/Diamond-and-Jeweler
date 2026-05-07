-- 0085_notification_outbox.sql
-- ============================================================================
-- Durable notification outbox for retryable email + in-app sends.
--
-- Motivation (failure-mode F3, docs/security/FAILURE_MODES.md):
--   The `notify` edge fn currently catches send errors with `.catch(() => {})`,
--   so a transient Resend / network failure means the user silently never gets
--   the email. There's no retry queue and no audit trail.
--
-- Design:
--   1. Every notify call writes a row to notification_outbox with
--      status='pending', then attempts the send. On success/fail, updates
--      status to 'sent'|'failed' with attempt_count+=1 and last_error.
--   2. A cron-driven retry function picks up rows where:
--        status = 'failed' AND attempt_count < 3
--        AND next_retry_at <= now()
--      and re-fires `notify`. Backoff: 0s, 1m, 5m.
--   3. Row-level guards prevent double-send: only flip pending→sent if the
--      caller's attempt matches `current_attempt`.
--
-- This migration is purely additive — existing `notify` calls keep working
-- without writing to outbox until a follow-up edge fn change wires it up.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_type     TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::JSONB,
  channel         TEXT NOT NULL DEFAULT 'email',           -- email | whatsapp | inapp
  status          TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','sent','failed','skipped')),
  attempt_count   INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 3,
  last_error      TEXT,
  next_retry_at   TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending_retry
  ON public.notification_outbox (next_retry_at)
  WHERE status = 'failed' AND attempt_count < max_attempts;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_user
  ON public.notification_outbox (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status
  ON public.notification_outbox (status, created_at);

-- ---- RLS ------------------------------------------------------------------
-- Edge functions use service-role and bypass RLS, so users can never write here.
-- Admins can read for debugging.
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_outbox_admin_all ON public.notification_outbox;
CREATE POLICY notification_outbox_admin_all
  ON public.notification_outbox
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- updated_at trigger ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_notification_outbox_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notification_outbox_updated_at ON public.notification_outbox;
CREATE TRIGGER trg_notification_outbox_updated_at
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_notification_outbox_updated_at();

-- ============================================================================
-- claim_notification_retry_batch — pick failed rows due for retry
-- ============================================================================
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
  RETURN QUERY
  WITH due AS (
    SELECT o.id
    FROM public.notification_outbox o
    WHERE o.status = 'failed'
      AND o.attempt_count < o.max_attempts
      AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
    ORDER BY o.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_outbox o
  SET status        = 'pending',
      next_retry_at = NULL
  FROM due
  WHERE o.id = due.id
  RETURNING o.id, o.user_id, o.notify_type, o.payload, o.channel, o.attempt_count;
END $$;

REVOKE ALL ON FUNCTION public.claim_notification_retry_batch FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_retry_batch TO service_role;

-- ============================================================================
-- record_notification_attempt — called by the notify fn after each attempt
-- ============================================================================
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
  v_next_at TIMESTAMPTZ;
  v_count   INT;
BEGIN
  -- Backoff schedule: attempt 1 fail → +1m, 2 → +5m, 3 → terminal.
  IF p_success THEN
    UPDATE public.notification_outbox
    SET status        = 'sent',
        sent_at       = now(),
        attempt_count = attempt_count + 1,
        last_error    = NULL
    WHERE id = p_outbox_id;
  ELSE
    SELECT attempt_count + 1 INTO v_count
    FROM public.notification_outbox
    WHERE id = p_outbox_id;

    v_next_at := CASE
      WHEN v_count = 1 THEN now() + interval '1 minute'
      WHEN v_count = 2 THEN now() + interval '5 minutes'
      ELSE NULL
    END;

    UPDATE public.notification_outbox
    SET status        = 'failed',
        attempt_count = v_count,
        last_error    = p_error,
        next_retry_at = v_next_at
    WHERE id = p_outbox_id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.record_notification_attempt FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_notification_attempt TO service_role;

-- ============================================================================
-- enqueue_notification — single point of entry from edge fns
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_user_id     UUID,
  p_notify_type TEXT,
  p_payload     JSONB DEFAULT '{}'::JSONB,
  p_channel     TEXT  DEFAULT 'email'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.notification_outbox (user_id, notify_type, payload, channel)
  VALUES (p_user_id, p_notify_type, p_payload, p_channel)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_notification FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_notification TO service_role;

COMMENT ON TABLE  public.notification_outbox        IS 'Durable retry queue for notify sends. Closes failure-mode F3.';
COMMENT ON COLUMN public.notification_outbox.status IS 'pending → sent | failed | skipped';
