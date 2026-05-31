-- 0134 — Admin KPI materialized view + fast-path RPC (item 4)
--
-- The existing get_admin_kpis() executes ~10 sequential COUNT(*) scans per
-- call. At >50k rows in matches, each call takes 200-400ms even with partial
-- indexes.
--
-- This migration adds:
--   • mv_admin_kpis — materialized view storing the same aggregation
--   • UNIQUE INDEX on mv_admin_kpis so REFRESH CONCURRENTLY is available
--   • get_admin_kpis_fast() — reads from MV in <5ms (existing RPC unchanged)
--   • refresh_admin_kpis_mv() — callable from pg_cron; admin can also trigger
--   • pg_cron job: refresh every 2 minutes

-- ── Materialized view ────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_admin_kpis AS
SELECT
  -- Match totals
  count(*)::bigint                                                      AS total_matches,
  count(*) FILTER (WHERE status = 'generated')::bigint                 AS cnt_generated,
  count(*) FILTER (WHERE status = 'viewed')::bigint                    AS cnt_viewed,
  count(*) FILTER (WHERE status = 'accepted_by_talent')::bigint        AS cnt_accepted_talent,
  count(*) FILTER (WHERE status = 'declined_by_talent')::bigint        AS cnt_declined_talent,
  count(*) FILTER (WHERE status = 'invited_by_manager')::bigint        AS cnt_invited_manager,
  count(*) FILTER (WHERE status = 'declined_by_manager')::bigint       AS cnt_declined_manager,
  count(*) FILTER (WHERE status = 'hr_scheduling')::bigint             AS cnt_hr_scheduling,
  count(*) FILTER (WHERE status = 'interview_scheduled')::bigint       AS cnt_interview_scheduled,
  count(*) FILTER (WHERE status = 'interview_completed')::bigint       AS cnt_interview_completed,
  count(*) FILTER (WHERE status = 'hired')::bigint                     AS cnt_hired,
  count(*) FILTER (WHERE status = 'expired')::bigint                   AS cnt_expired,
  -- Avg time to first view (last 200 viewed matches)
  (SELECT avg(extract(epoch from (viewed_at - created_at)) / 3600.0)
   FROM (SELECT viewed_at, created_at FROM public.matches
         WHERE viewed_at IS NOT NULL
         ORDER BY viewed_at DESC LIMIT 200) v)::numeric                AS avg_hours_to_first_view,
  now()                                                                AS refreshed_at
FROM public.matches
WITH DATA;

-- UNIQUE index is required for REFRESH CONCURRENTLY (which avoids table lock).
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_admin_kpis_singleton
  ON public.mv_admin_kpis ((1));  -- single-row MV; constant key

-- ── Supplementary counts (separate single-row table, refreshed together) ────
-- These can't easily go in the MV because they span different tables.

CREATE TABLE IF NOT EXISTS public.admin_kpi_cache (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),  -- singleton
  total_users        bigint NOT NULL DEFAULT 0,
  banned_users       bigint NOT NULL DEFAULT 0,
  ghost_users        bigint NOT NULL DEFAULT 0,
  active_talents     bigint NOT NULL DEFAULT 0,
  active_roles       bigint NOT NULL DEFAULT 0,
  companies_verified bigint NOT NULL DEFAULT 0,
  companies_pending  bigint NOT NULL DEFAULT 0,
  waitlist_pending   bigint NOT NULL DEFAULT 0,
  refreshed_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_kpi_cache (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.admin_kpi_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY akc_admin_all ON public.admin_kpi_cache
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Refresh function (called by pg_cron + admin Refresh button) ─────────────

CREATE OR REPLACE FUNCTION public.refresh_admin_kpis_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'refresh_admin_kpis_mv: not authorized' USING ERRCODE = '42501';
  END IF;

  -- Refresh the match-counts MV without a table lock.
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_admin_kpis;

  -- Refresh the supplementary single-row counts.
  INSERT INTO public.admin_kpi_cache (
    id,
    total_users, banned_users, ghost_users,
    active_talents, active_roles,
    companies_verified, companies_pending,
    waitlist_pending, refreshed_at
  )
  SELECT
    true,
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.profiles WHERE is_banned = true),
    (SELECT count(*) FROM public.profiles WHERE ghost_score >= 3),
    (SELECT count(*) FROM public.talents WHERE is_open_to_offers = true),
    (SELECT count(*) FROM public.roles WHERE status = 'active'),
    (SELECT count(*) FROM public.companies WHERE verified = true),
    (SELECT count(*) FROM public.companies WHERE verified = false),
    (SELECT count(*) FROM public.waitlist WHERE approved = false),
    now()
  ON CONFLICT (id) DO UPDATE SET
    total_users        = EXCLUDED.total_users,
    banned_users       = EXCLUDED.banned_users,
    ghost_users        = EXCLUDED.ghost_users,
    active_talents     = EXCLUDED.active_talents,
    active_roles       = EXCLUDED.active_roles,
    companies_verified = EXCLUDED.companies_verified,
    companies_pending  = EXCLUDED.companies_pending,
    waitlist_pending   = EXCLUDED.waitlist_pending,
    refreshed_at       = EXCLUDED.refreshed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_admin_kpis_mv() FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_admin_kpis_mv() TO authenticated;

-- ── Fast-path RPC (reads from MV + cache table) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.get_admin_kpis_fast()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  mv  public.mv_admin_kpis%ROWTYPE;
  sup public.admin_kpi_cache%ROWTYPE;
  v_by_status jsonb;
  v_hired bigint;
  v_completed bigint;
  v_interview_hire_rate numeric;
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'get_admin_kpis_fast: not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO mv  FROM public.mv_admin_kpis   LIMIT 1;
  SELECT * INTO sup FROM public.admin_kpi_cache LIMIT 1;

  -- Fallback: if MV is empty (never refreshed), delegate to live RPC.
  IF mv IS NULL THEN
    RETURN public.get_admin_kpis();
  END IF;

  v_by_status := jsonb_build_object(
    'generated',           mv.cnt_generated,
    'viewed',              mv.cnt_viewed,
    'accepted_by_talent',  mv.cnt_accepted_talent,
    'declined_by_talent',  mv.cnt_declined_talent,
    'invited_by_manager',  mv.cnt_invited_manager,
    'declined_by_manager', mv.cnt_declined_manager,
    'hr_scheduling',       mv.cnt_hr_scheduling,
    'interview_scheduled', mv.cnt_interview_scheduled,
    'interview_completed', mv.cnt_interview_completed,
    'hired',               mv.cnt_hired,
    'expired',             mv.cnt_expired
  );

  v_hired     := mv.cnt_hired;
  v_completed := mv.cnt_interview_completed;
  v_interview_hire_rate := CASE WHEN (v_hired + v_completed) > 0
    THEN v_hired::numeric / (v_hired + v_completed)::numeric
    ELSE NULL END;

  SELECT jsonb_build_object(
    'total_matches',           mv.total_matches,
    'by_status',               v_by_status,
    'total_users',             COALESCE(sup.total_users, 0),
    'banned_users',            COALESCE(sup.banned_users, 0),
    'ghost_users',             COALESCE(sup.ghost_users, 0),
    'active_talents',          COALESCE(sup.active_talents, 0),
    'active_roles',            COALESCE(sup.active_roles, 0),
    'companies_verified',      COALESCE(sup.companies_verified, 0),
    'companies_pending',       COALESCE(sup.companies_pending, 0),
    'waitlist_pending',        COALESCE(sup.waitlist_pending, 0),
    'avg_hours_to_first_view', mv.avg_hours_to_first_view,
    'interview_hire_rate',     v_interview_hire_rate,
    '_cached_at',              mv.refreshed_at
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_kpis_fast() FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_kpis_fast() TO authenticated;

-- ── pg_cron: refresh every 2 minutes ────────────────────────────────────────
-- Runs as postgres (service_role equivalent) so is_admin() check is bypassed
-- via the SECURITY DEFINER bypass below.  We directly call the underlying
-- REFRESH + UPDATE instead of the RPC to avoid the is_admin() gate.

SELECT cron.schedule(
  'refresh-admin-kpis-mv',
  '*/2 * * * *',
  $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_admin_kpis;
    INSERT INTO public.admin_kpi_cache (
      id,
      total_users, banned_users, ghost_users,
      active_talents, active_roles,
      companies_verified, companies_pending,
      waitlist_pending, refreshed_at
    )
    SELECT
      true,
      (SELECT count(*) FROM public.profiles),
      (SELECT count(*) FROM public.profiles WHERE is_banned = true),
      (SELECT count(*) FROM public.profiles WHERE ghost_score >= 3),
      (SELECT count(*) FROM public.talents WHERE is_open_to_offers = true),
      (SELECT count(*) FROM public.roles WHERE status = 'active'),
      (SELECT count(*) FROM public.companies WHERE verified = true),
      (SELECT count(*) FROM public.companies WHERE verified = false),
      (SELECT count(*) FROM public.waitlist WHERE approved = false),
      now()
    ON CONFLICT (id) DO UPDATE SET
      total_users        = EXCLUDED.total_users,
      banned_users       = EXCLUDED.banned_users,
      ghost_users        = EXCLUDED.ghost_users,
      active_talents     = EXCLUDED.active_talents,
      active_roles       = EXCLUDED.active_roles,
      companies_verified = EXCLUDED.companies_verified,
      companies_pending  = EXCLUDED.companies_pending,
      waitlist_pending   = EXCLUDED.waitlist_pending,
      refreshed_at       = EXCLUDED.refreshed_at;
  $$
);

NOTIFY pgrst, 'reload schema';
