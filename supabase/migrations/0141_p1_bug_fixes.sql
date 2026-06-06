-- ============================================================================
-- 0141 — P1 bug fixes
--
-- BUG-7:  payment-webhook extra_matches_used counter was read-modify-write,
--         not atomic. Two concurrent webhooks for different purchases on the
--         same role/talent could both read the same stale value and net +1
--         instead of +2. Fix: atomic UPDATE ... SET col = col + qty.
--
-- BUG-9:  get_admin_kpis_fast() fell back to public.get_admin_kpis() when
--         the MV was empty (fresh deploy). If that function doesn't exist yet
--         the RPC threw "function does not exist" instead of returning zeros.
--         Fix: return a zeros stub on empty MV.
--
-- BUG-10: auth_events_admin_select policy used p.role = 'admin'::text which
--         excludes any variant role strings (e.g. 'super_admin'). Migration
--         0138 baked this fragile literal in during the auth.uid() wrap.
--         Fix: delegate to the existing is_admin() helper.
-- ============================================================================

-- ── BUG-7: atomic increment helper ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_extra_matches_used(
  p_table text,
  p_id    uuid,
  p_qty   integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF p_table = 'roles' THEN
    UPDATE public.roles
       SET extra_matches_used = COALESCE(extra_matches_used, 0) + p_qty
     WHERE id = p_id;
  ELSIF p_table = 'talents' THEN
    UPDATE public.talents
       SET extra_matches_used = COALESCE(extra_matches_used, 0) + p_qty
     WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'increment_extra_matches_used: unknown table %', p_table;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_extra_matches_used(text, uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_extra_matches_used(text, uuid, integer) TO service_role;

-- ── BUG-9: get_admin_kpis_fast() safe zero-fallback ─────────────────────────

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

  -- Fallback: MV not yet refreshed (fresh deploy). Return zeros rather than
  -- calling get_admin_kpis() which may not exist on this schema version.
  IF mv IS NULL THEN
    RETURN jsonb_build_object(
      'total_matches',           0,
      'by_status',               jsonb_build_object(
        'generated', 0, 'viewed', 0,
        'accepted_by_talent', 0, 'declined_by_talent', 0,
        'invited_by_manager', 0, 'declined_by_manager', 0,
        'hr_scheduling', 0, 'interview_scheduled', 0,
        'interview_completed', 0, 'hired', 0, 'expired', 0
      ),
      'total_users',             0,
      'banned_users',            0,
      'ghost_users',             0,
      'active_talents',          0,
      'active_roles',            0,
      'companies_verified',      0,
      'companies_pending',       0,
      'waitlist_pending',        0,
      'avg_hours_to_first_view', null,
      'interview_hire_rate',     null,
      '_cached_at',              now()
    );
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

-- ── BUG-10: auth_events_admin_select — use is_admin() instead of literal ────

ALTER POLICY "auth_events_admin_select" ON public.auth_events
  USING (public.is_admin());
