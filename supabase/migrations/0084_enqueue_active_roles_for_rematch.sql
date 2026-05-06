-- ============================================================
-- 0084 — enqueue_active_roles_for_rematch helper (kept for future use)
--
-- Originally intended to bulk-enqueue active roles into match_queue
-- on talent extraction completion. The Edge Functions now call
-- matchForRole inline against top-N active roles instead — simpler,
-- no dependency on the queue drain pipeline. This RPC stays so admin
-- tooling can fan out manually if ever needed.
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
