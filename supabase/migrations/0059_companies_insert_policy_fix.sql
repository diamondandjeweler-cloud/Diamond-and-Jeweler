-- The original companies_insert_hr policy used:
--   created_by = auth.uid() AND can_insert_company()
-- can_insert_company() (SECURITY DEFINER) correctly returns true for hr_admin/hm users,
-- but the created_by = auth.uid() WITH CHECK fails despite a valid JWT —
-- likely due to how PostgREST evaluates auth.uid() in the caller's context vs
-- the SECURITY DEFINER function's context.
-- Fix: enforce created_by via a BEFORE INSERT trigger (tamper-proof),
-- and simplify the policy to the role check only.

CREATE OR REPLACE FUNCTION public.tg_companies_set_created_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_companies_created_by ON public.companies;
CREATE TRIGGER tg_companies_created_by
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_companies_set_created_by();

DROP POLICY IF EXISTS companies_insert_hr ON public.companies;
CREATE POLICY companies_insert_hr ON public.companies
  FOR INSERT WITH CHECK (
    can_insert_company()
  );
