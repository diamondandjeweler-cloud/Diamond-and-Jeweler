-- 0143 — revoke over-broad execute grants on service-only functions
--
-- Supabase's default privilege model grants EXECUTE to anon, authenticated,
-- and PUBLIC when a function is created/replaced, even if the migration
-- immediately does REVOKE ALL FROM public — that only removes the PUBLIC
-- pseudo-role, not the explicit per-role grants.
--
-- increment_extra_matches_used: SECURITY DEFINER, bypasses RLS, mutates
-- billing counters. Must be service_role-only.
--
-- take_admin_daily_snapshot: SECURITY DEFINER, overwrites admin KPI data.
-- anon + PUBLIC removed; authenticated kept so PostgREST admin calls work
-- (the is_admin() guard inside the function rejects non-admins at runtime).

REVOKE EXECUTE ON FUNCTION public.increment_extra_matches_used(text, uuid, integer)
  FROM anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.take_admin_daily_snapshot()
  FROM anon, PUBLIC;
