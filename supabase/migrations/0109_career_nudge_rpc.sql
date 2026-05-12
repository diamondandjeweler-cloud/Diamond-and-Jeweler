-- 0109_career_nudge_rpc.sql
--
-- Replaces the direct PostgREST `?select=life_chart_character` frontend query
-- with a SECURITY DEFINER RPC that returns only the generic nudge category.
-- The raw column name is never exposed to the browser's Network tab.
--
-- Nudge categories (mirrors yearLuck.ts):
--   skill_dev  — stage 2
--   move_fast  — stages 5-7
--   ramp_up    — stage 4
--   NULL       — all other stages, or unknown character/year
--
-- Caller must be authenticated; always operates on the calling user's own row.

CREATE OR REPLACE FUNCTION public.get_career_nudge(p_year int DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_char       text;
  v_anchor     int;
  v_stage      int;
  v_year       int  := COALESCE(p_year, EXTRACT(YEAR FROM now())::int);

  -- ANCHOR_YEAR table matches yearLuck.ts constants exactly.
  -- Key: character code, Value: anchor year (stage-1 year for that character).
  v_anchors    json := '{
    "W":  2026,
    "E-": 2027,
    "W+": 2028,
    "W-": 2029,
    "E":  2030,
    "G+": 2031,
    "G-": 2032,
    "E+": 2033,
    "F":  2034
  }';
BEGIN
  -- Pull life_chart_character for the calling user from either table.
  -- talent row takes precedence; falls through to hiring_managers if absent.
  SELECT life_chart_character INTO v_char
  FROM talents
  WHERE profile_id = v_uid
  LIMIT 1;

  IF v_char IS NULL THEN
    SELECT life_chart_character INTO v_char
    FROM hiring_managers
    WHERE profile_id = v_uid
    LIMIT 1;
  END IF;

  IF v_char IS NULL THEN
    RETURN NULL;
  END IF;

  v_anchor := (v_anchors ->> v_char)::int;
  IF v_anchor IS NULL THEN
    RETURN NULL;  -- unknown character code
  END IF;

  -- Stage formula: ((((year - anchor) % 9) + 9) % 9) + 1 (1-indexed, 1..9)
  v_stage := (((( v_year - v_anchor) % 9) + 9) % 9) + 1;

  RETURN CASE v_stage
    WHEN 2 THEN 'skill_dev'
    WHEN 4 THEN 'ramp_up'
    WHEN 5 THEN 'move_fast'
    WHEN 6 THEN 'move_fast'
    WHEN 7 THEN 'move_fast'
    ELSE NULL
  END;
END;
$$;

-- Revoke public access; only authenticated callers may invoke.
REVOKE ALL ON FUNCTION public.get_career_nudge(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_career_nudge(int) TO authenticated;
