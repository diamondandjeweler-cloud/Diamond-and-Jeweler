-- 0088_growth_nudge_fixes.sql
-- ============================================================================
-- Module 4 follow-up: harden snooze_growth_nudges so it errors instead of
-- silently no-op'ing when called by a non-talent user (e.g. a hiring manager
-- who somehow reaches the RPC). Without this, the caller cannot distinguish
-- a successful snooze from a no-effect call against a missing talent row.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.snooze_growth_nudges(
  p_months INTEGER DEFAULT 3
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_until TIMESTAMPTZ;
  v_uid   UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_months <= 0 OR p_months > 24 THEN
    RAISE EXCEPTION 'months must be between 1 and 24';
  END IF;
  v_until := now() + (p_months || ' months')::INTERVAL;
  UPDATE public.talents
  SET growth_nudge_snooze_until = v_until
  WHERE profile_id = v_uid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'no talent profile found for current user';
  END IF;
  RETURN v_until;
END $$;

REVOKE ALL ON FUNCTION public.snooze_growth_nudges FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snooze_growth_nudges TO authenticated;
