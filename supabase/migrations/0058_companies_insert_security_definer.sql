-- Replace inline subquery WITH CHECK with a SECURITY DEFINER helper.
-- The original policy did EXISTS(SELECT 1 FROM profiles ...) inline, which
-- runs under the caller's RLS context. If the profiles SELECT RLS blocks
-- the lookup (e.g. due to policy interaction), the WITH CHECK silently fails
-- with "new row violates row-level security policy".
-- Using SECURITY DEFINER bypasses profiles RLS for this specific read,
-- consistent with the pattern established in migration 0015.
-- Also drops the fragile email match in favour of created_by = auth.uid().

CREATE OR REPLACE FUNCTION public.can_insert_company()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('hr_admin', 'hiring_manager')
  );
$$;

DROP POLICY IF EXISTS companies_insert_hr ON public.companies;

CREATE POLICY companies_insert_hr ON public.companies
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND can_insert_company()
  );
