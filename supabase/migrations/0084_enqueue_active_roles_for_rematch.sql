-- ============================================================
-- 0083 — enqueue_active_roles_for_rematch helper + match_queue drain cron
--
-- Triggered after a new talent's extraction completes: bulk-enqueues a
-- bounded set of active roles for re-evaluation so the new candidate is
-- considered without waiting for HM-side actions or random cron drift.
--
-- Capped by p_limit (default 50, hard cap 200) to bound work per call —
-- at pilot scale this is one cycle of the matcher; at scale we'll rely
-- more on the cron drain than the inline burst.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enqueue_active_roles_for_rematch(
  p_limit INT DEFAULT 50,
  p_priority INT DEFAULT 5
)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
  v_capped INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  INSERT INTO public.match_queue (role_id, priority)
  SELECT r.id, p_priority
  FROM   public.roles r
  WHERE  r.status = 'active'
    AND  (r.vacancy_expires_at IS NULL OR r.vacancy_expires_at > now())
    AND  NOT EXISTS (
      SELECT 1 FROM public.match_queue q
      WHERE  q.role_id = r.id
        AND  q.status IN ('pending','processing')
    )
  ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
  LIMIT  v_capped
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── Drain cron: every 2 minutes ──────────────────────────────────────────────
-- Catches anything inline drains miss (Edge Function crash, queue grows
-- beyond a single drain's batch size). Independent of talent onboarding.

select
  cron.schedule(
    'bole-process-match-queue-2min',
    '*/2 * * * *',
    $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
             || '/functions/v1/process-match-queue',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    $cron$
  );
