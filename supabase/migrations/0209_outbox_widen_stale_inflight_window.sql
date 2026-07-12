-- 0209_outbox_widen_stale_inflight_window.sql
-- ============================================================================
-- RELIABILITY (reaudit notifications-2, PLAUSIBLE) — widen the stale-'sending'
-- re-claim window from 2 min to 10 min so the retry loop cannot double-send.
--
-- 0200 hardened claim_notification_retry_batch so a claimed row flips to
-- 'sending' and spends an attempt before notify re-hits Resend. But it re-claimed
-- a 'sending' row after only 2 minutes. notify's resend.emails.send()
-- (notify/index.ts) has NO request timeout, so a hung/slow send stays in-flight
-- until the Supabase edge wall-clock ceiling (minutes, up to ~400s). At 2 min a
-- second cron tick could re-claim a row whose FIRST re-fire is still mid-send —
-- provider_message_id not yet stamped, so the notify de-dupe guard misses — and
-- send a DUPLICATE email. 10 min sits safely above that ceiling: by re-claim the
-- first worker is guaranteed dead, and any send it completed has stamped
-- provider_message_id and is caught by the de-dupe guard. Only cost is slower
-- recovery of genuinely-stranded rows (a rare backstop — notification-retry
-- records failures synchronously on any non-2xx/thrown re-fire).
--
-- WHY A FRESH MIGRATION (not an in-place edit of 0200): 0200 is part of the
-- staged Wave-B manifest (docs/STAGED_DEPLOYS.md). A migration runner tracks
-- files by checksum and will NOT re-run 0200 if it was already applied, so an
-- in-place edit could be SILENTLY SKIPPED. Re-applying the RPC via CREATE OR
-- REPLACE in the next-free migration guarantees the wider window lands whether or
-- not 0200 has already been applied — the same discipline that split 0200 out of
-- 0194.
--
-- Idempotent (CREATE OR REPLACE, same signature/return as 0085/0200). The ONLY
-- change vs. 0200 is the 'sending' stale interval (2 min -> 10 min); Step 1
-- exhausted-retirement, the failed-backoff branch, and the stranded-'pending'
-- (5 min) window are unchanged. record_notification_attempt is untouched.
-- Author-only — owner must apply.
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
