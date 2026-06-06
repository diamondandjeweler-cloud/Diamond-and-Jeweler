-- 0144 — Remove created_at from admin_daily_snapshot ON CONFLICT update list
--
-- Migration 0142 rewrote take_admin_daily_snapshot() but kept `created_at = now()`
-- in the ON CONFLICT DO UPDATE SET clause. This means every time the cron re-runs
-- the same day (e.g. a manual refresh or a retry after failure), the created_at
-- timestamp is overwritten with the current time instead of preserving when the
-- row was first inserted for that date.
--
-- Fix: drop created_at from the UPDATE list so it only gets written on INSERT.

CREATE OR REPLACE FUNCTION public.take_admin_daily_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied';
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
    urgent_priority_reqs   = EXCLUDED.urgent_priority_reqs;
    -- created_at intentionally omitted: preserve the original insert time.

  -- Prune rows older than 365 days.
  DELETE FROM public.admin_daily_snapshot
  WHERE snapshot_date < current_date - INTERVAL '365 days';
END;
$$;
