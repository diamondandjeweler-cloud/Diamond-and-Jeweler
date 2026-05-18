-- 0124_interviews_rls_fix.sql
--
-- Fix: interviews_all_hr RLS policy runs a 5-table correlated subquery
-- (matches → roles → hiring_managers → companies → profiles via email join)
-- once per row, causing HRDashboard to hang for 10+ seconds.
--
-- Root cause: same pattern fixed in 0015 for other tables — correlated EXISTS
-- with per-row join evaluation.
--
-- Fix: introduce auth_hr_company_id() STABLE SECURITY DEFINER.
--   STABLE = Postgres evaluates it ONCE per query statement and reuses the result.
--   SECURITY DEFINER = bypasses inner-table RLS, preventing recursive policy chains.
--
-- Then rewrite interviews_all_hr to: match_id → match → role → hm.company_id
-- against the precomputed company uuid. With idx_interviews_match, idx_roles_hm,
-- and idx_hm_company all present, each row lookup is 3 indexed lookups not
-- a 5-table join from scratch.

CREATE OR REPLACE FUNCTION public.auth_hr_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT c.id
  FROM public.companies c
  JOIN public.profiles p ON p.email = c.primary_hr_email
  WHERE p.id = auth.uid()
    AND p.role = 'hr_admin'
  LIMIT 1;
$$;

-- Re-create the HR policy using the stable helper.
DROP POLICY IF EXISTS interviews_all_hr ON public.interviews;

CREATE POLICY interviews_all_hr ON public.interviews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
        JOIN public.roles r   ON r.id  = m.role_id
        JOIN public.hiring_managers hm ON hm.id = r.hiring_manager_id
      WHERE m.id = interviews.match_id
        AND hm.company_id = public.auth_hr_company_id()
    )
  );
