-- 0133 — Mark RLS helper functions LEAKPROOF (item 5)
--
-- STABLE was already set in 0014 / 0015. Adding LEAKPROOF tells the planner
-- that the function cannot reveal information about data it accesses —
-- safe to call before RLS security quals are applied.
--
-- Combined with STABLE + SECURITY DEFINER, the planner can:
--   1. Evaluate the function once per unique args tuple (not once per row)
--   2. Push it through join nodes / sub-plan barriers
--   3. Cache the result within the scope of a single statement
--
-- All helpers return boolean EXISTS(...) — no exceptions thrown per row,
-- no side effects. LEAKPROOF is accurate.
--
-- LEAKPROOF requires superuser; runs as postgres on managed Supabase.

ALTER FUNCTION public.talent_can_see_role(uuid)   LEAKPROOF;
ALTER FUNCTION public.hm_can_see_talent(uuid)      LEAKPROOF;
ALTER FUNCTION public.user_is_hm_of_role(uuid)     LEAKPROOF;
ALTER FUNCTION public.user_is_hr_of_role(uuid)     LEAKPROOF;
ALTER FUNCTION public.user_is_hr_of_company(uuid)  LEAKPROOF;
ALTER FUNCTION public.user_is_hm_in_company(uuid)  LEAKPROOF;

-- is_admin() was already marked STABLE in 0002 — mark LEAKPROOF too.
ALTER FUNCTION public.is_admin()                   LEAKPROOF;
