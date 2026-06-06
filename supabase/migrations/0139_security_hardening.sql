-- ============================================================================
-- 0139 — Security hardening (2026-06-06)
--
-- Fixes identified in the 2026-06-06 security audit:
--
-- [1] profiles_update_self WITH CHECK regression from 0138
--     The auth.uid() wrapping sweep in 0138 accidentally dropped 'admin' from
--     the allowed role list, blocking admins from updating their own profile.
--     Applied as a live SQL hotfix on 2026-06-06; this migration records and
--     re-applies it so the schema is reproducible.
--
-- [2] take_admin_daily_snapshot() — missing is_admin() guard
--     The function was SECURITY DEFINER and callable by any authenticated user
--     via PostgREST RPC without a role check, allowing any talent/HM to
--     overwrite today's admin snapshot row. Added is_admin() gate.
--
-- Both changes are idempotent (ALTER POLICY + CREATE OR REPLACE FUNCTION).
-- ============================================================================


-- ── [1] Restore 'admin' in profiles_update_self WITH CHECK ─────────────────
ALTER POLICY "profiles_update_self" ON public.profiles
  USING (((select auth.uid()) = id))
  WITH CHECK (
    ((select auth.uid()) = id)
    AND (role = ANY (ARRAY['talent'::text, 'hiring_manager'::text, 'hr_admin'::text, 'admin'::text]))
    AND (is_banned = false)
  );


-- ── [2] Add is_admin() gate to take_admin_daily_snapshot() ─────────────────
CREATE OR REPLACE FUNCTION public.take_admin_daily_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Authorization gate: only admins may take a snapshot.
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.admin_daily_snapshot (
    snapshot_date,
    total_users, total_talents, total_hm, total_hr,
    open_talents, active_roles, verified_companies,
    total_matches, matches_generated, matches_hired, matches_expired,
    extra_match_purchases, urgent_priority_reqs
  )
  SELECT
    current_date,
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.profiles WHERE role = 'talent'),
    (SELECT count(*) FROM public.profiles WHERE role = 'hiring_manager'),
    (SELECT count(*) FROM public.profiles WHERE role = 'hr_admin'),
    (SELECT count(*) FROM public.talents WHERE is_open_to_offers = true),
    (SELECT count(*) FROM public.roles   WHERE status = 'active'),
    (SELECT count(*) FROM public.companies WHERE verified = true),
    (SELECT count(*) FROM public.matches),
    (SELECT count(*) FROM public.matches WHERE status = 'generated'),
    (SELECT count(*) FROM public.matches WHERE status = 'hired'),
    (SELECT count(*) FROM public.matches WHERE status = 'expired'),
    (SELECT count(*) FROM public.extra_match_purchases),
    (SELECT count(*) FROM public.urgent_priority_requests)
  ON CONFLICT (snapshot_date) DO UPDATE SET
    total_users            = EXCLUDED.total_users,
    total_talents          = EXCLUDED.total_talents,
    total_hm               = EXCLUDED.total_hm,
    total_hr               = EXCLUDED.total_hr,
    open_talents           = EXCLUDED.open_talents,
    active_roles           = EXCLUDED.active_roles,
    verified_companies     = EXCLUDED.verified_companies,
    total_matches          = EXCLUDED.total_matches,
    matches_generated      = EXCLUDED.matches_generated,
    matches_hired          = EXCLUDED.matches_hired,
    matches_expired        = EXCLUDED.matches_expired,
    extra_match_purchases  = EXCLUDED.extra_match_purchases,
    urgent_priority_reqs   = EXCLUDED.urgent_priority_reqs,
    created_at             = now();

  -- Prune rows older than 365 days.
  DELETE FROM public.admin_daily_snapshot
  WHERE snapshot_date < current_date - INTERVAL '365 days';
END;
$$;
