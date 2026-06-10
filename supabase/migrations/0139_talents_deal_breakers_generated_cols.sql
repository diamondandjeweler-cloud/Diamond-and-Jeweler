-- ============================================================================
-- 0139 — Generated stored columns for talents.deal_breakers + matchmaker v3
--
-- Audit item #9 from the 2026-06-04 perf review. Promotes the 9 most-checked
-- JSONB keys + the salary hard floor to GENERATED ALWAYS AS … STORED columns,
-- so get_match_candidates doesn't pay the JSON extract + cast cost per row
-- scanned (currently 9 casts × N rows on every matchmaker call).
--
-- Trade-off: ~25 extra bytes per talent row (~kilobytes at full scale) for
-- a hot-path simplification. STORED keeps them physical so the planner can
-- collect column statistics — JSONB extraction yields no stats today.
--
-- Backward-compat: the JSONB column stays, idx_talents_deal_breakers_gin
-- (0137) stays for ad-hoc queries on other keys. The matchmaker function
-- body is rewritten to read the new columns; signature is unchanged so
-- match-generate / match-core.ts keep working without redeploy.
--
-- Data audit (live, 2026-06-10): all current values are either jsonb null
-- or the expected scalar type → cast cannot fail. Defensive CASE not needed.
-- ============================================================================


-- ── Add 10 generated columns ────────────────────────────────────────────────
-- ADD COLUMN GENERATED STORED triggers a one-shot table rewrite. On 30 rows
-- that's instantaneous; safe in a transaction.

ALTER TABLE public.talents
  ADD COLUMN IF NOT EXISTS db_no_weekend_work    boolean GENERATED ALWAYS AS ((deal_breakers->>'no_weekend_work')::boolean)    STORED,
  ADD COLUMN IF NOT EXISTS db_no_driving_license boolean GENERATED ALWAYS AS ((deal_breakers->>'no_driving_license')::boolean) STORED,
  ADD COLUMN IF NOT EXISTS db_no_travel          boolean GENERATED ALWAYS AS ((deal_breakers->>'no_travel')::boolean)          STORED,
  ADD COLUMN IF NOT EXISTS db_no_night_shifts    boolean GENERATED ALWAYS AS ((deal_breakers->>'no_night_shifts')::boolean)    STORED,
  ADD COLUMN IF NOT EXISTS db_no_own_car         boolean GENERATED ALWAYS AS ((deal_breakers->>'no_own_car')::boolean)         STORED,
  ADD COLUMN IF NOT EXISTS db_no_relocation      boolean GENERATED ALWAYS AS ((deal_breakers->>'no_relocation')::boolean)      STORED,
  ADD COLUMN IF NOT EXISTS db_no_overtime        boolean GENERATED ALWAYS AS ((deal_breakers->>'no_overtime')::boolean)        STORED,
  ADD COLUMN IF NOT EXISTS db_no_commission_only boolean GENERATED ALWAYS AS ((deal_breakers->>'no_commission_only')::boolean) STORED,
  ADD COLUMN IF NOT EXISTS db_remote_only        boolean GENERATED ALWAYS AS ((deal_breakers->>'remote_only')::boolean)        STORED,
  ADD COLUMN IF NOT EXISTS db_min_salary_hard    integer GENERATED ALWAYS AS ((deal_breakers->>'min_salary_hard')::integer)    STORED;


-- ── get_match_candidates v3 ────────────────────────────────────────────────
-- Same 22-arg signature as v2 (0114). Body rewritten to read generated cols
-- instead of (deal_breakers->>'…')::cast. PARALLEL SAFE + search_path
-- preserved from 0137.

CREATE OR REPLACE FUNCTION public.get_match_candidates(
  p_employment_type     text        DEFAULT NULL,
  p_salary_max          integer     DEFAULT NULL,
  p_hm_character        text        DEFAULT NULL,
  p_requires_weekend    boolean     DEFAULT false,
  p_requires_driving    boolean     DEFAULT false,
  p_requires_travel     boolean     DEFAULT false,
  p_has_night_shifts    boolean     DEFAULT false,
  p_requires_own_car    boolean     DEFAULT false,
  p_requires_relocation boolean     DEFAULT false,
  p_requires_overtime   boolean     DEFAULT false,
  p_is_commission       boolean     DEFAULT false,
  p_work_arrangement    text        DEFAULT NULL,
  p_required_work_auth  text[]      DEFAULT NULL,
  p_excluded_ids        uuid[]      DEFAULT NULL,
  p_limit               integer     DEFAULT 500,
  p_required_skills     text[]      DEFAULT NULL,
  p_languages_required  jsonb       DEFAULT NULL,
  p_min_education       text        DEFAULT NULL,
  p_role_eligibility    text[]      DEFAULT NULL,
  p_role_atoms          jsonb       DEFAULT NULL,
  p_hm_company_size     text        DEFAULT NULL,
  p_role_industry       text        DEFAULT NULL
)
RETURNS TABLE (talent_id uuid)
LANGUAGE sql STABLE PARALLEL SAFE
ROWS 200
SET search_path = public, pg_catalog
AS $$
  SELECT t.id AS talent_id
  FROM   talents t
  JOIN   profiles pr ON pr.id = t.profile_id
  LEFT JOIN life_chart_compatibility lcc
         ON lcc.hm_character     = p_hm_character
        AND lcc.talent_character = t.life_chart_character
  WHERE
    -- ── 1. Basic availability ──────────────────────────────────────────────
    t.is_open_to_offers = true
    AND pr.is_banned    = false
    AND (t.profile_expires_at IS NULL OR t.profile_expires_at >= now())

    -- ── 2. Employment type ────────────────────────────────────────────────
    AND (
      p_employment_type IS NULL
      OR t.employment_type_preferences @> ARRAY[p_employment_type]
    )

    -- ── 3. Salary max (soft floor) ────────────────────────────────────────
    AND (
      p_salary_max IS NULL
      OR t.expected_salary_min IS NULL
      OR t.expected_salary_min <= p_salary_max
    )

    -- ── 4. Deal-breaker flags (now via generated cols, not JSON extract) ─
    AND (NOT p_requires_weekend    OR t.db_no_weekend_work    IS NOT TRUE)
    AND (NOT p_requires_driving    OR t.db_no_driving_license IS NOT TRUE)
    AND (NOT p_requires_travel     OR t.db_no_travel          IS NOT TRUE)
    AND (NOT p_has_night_shifts    OR t.db_no_night_shifts    IS NOT TRUE)
    AND (NOT p_requires_own_car    OR t.db_no_own_car         IS NOT TRUE)
    AND (NOT p_requires_relocation OR t.db_no_relocation      IS NOT TRUE)
    AND (NOT p_requires_overtime   OR t.db_no_overtime        IS NOT TRUE)
    AND (NOT p_is_commission       OR t.db_no_commission_only IS NOT TRUE)
    AND (
      p_work_arrangement IN ('remote', 'hybrid')
      OR t.db_remote_only IS NOT TRUE
    )

    -- ── 5. Salary hard floor (now via generated col) ──────────────────────
    AND (
      p_salary_max IS NULL
      OR t.db_min_salary_hard IS NULL
      OR t.db_min_salary_hard <= p_salary_max
    )

    -- ── 6. Work authorization (per-role override of HM default) ───────────
    AND (
      coalesce(array_length(p_role_eligibility, 1), 0) > 0
        AND t.work_authorization = ANY(p_role_eligibility)
      OR (
        coalesce(array_length(p_role_eligibility, 1), 0) = 0
        AND (
          p_required_work_auth IS NULL
          OR array_length(p_required_work_auth, 1) IS NULL
          OR t.work_authorization = ANY(p_required_work_auth)
        )
      )
    )

    -- ── 7. Commission vs fixed-salary conflict ────────────────────────────
    AND (
      NOT p_is_commission
      OR t.salary_structure_preference IS DISTINCT FROM 'fixed_only'
    )

    -- ── 8. BaZi — exclude 'bad' character pairs ───────────────────────────
    AND (
      p_hm_character IS NULL
      OR t.life_chart_character IS NULL
      OR COALESCE(lcc.bucket, 'neutral') != 'bad'
    )

    -- ── 9. Already matched ────────────────────────────────────────────────
    AND (
      p_excluded_ids IS NULL
      OR t.id != ALL(p_excluded_ids)
    )

    -- ── 10. v2: required_skills ──────────────────────────────────────────
    AND (
      p_required_skills IS NULL
      OR array_length(p_required_skills, 1) IS NULL
      OR t.skills @> p_required_skills
    )

    -- ── 11. v2: min education ────────────────────────────────────────────
    AND (
      p_min_education IS NULL
      OR p_min_education = 'none'
      OR public.edu_rank(t.education_level) >= public.edu_rank(p_min_education)
    )

    -- ── 12. v2: required language codes ──────────────────────────────────
    AND (
      p_languages_required IS NULL
      OR jsonb_array_length(p_languages_required) = 0
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_languages_required) req
        WHERE NOT (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(t.languages_proficiency) lp
            WHERE lp->>'code' = req->>'code'
          )
          OR (
            jsonb_typeof(coalesce(t.languages, '[]'::jsonb)) = 'array'
            AND coalesce(t.languages, '[]'::jsonb) ? (req->>'code')
          )
        )
      )
    )

    -- ── 13. v2: role-side NN atoms ───────────────────────────────────────
    AND (
      p_role_atoms IS NULL
      OR jsonb_array_length(p_role_atoms) = 0
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_role_atoms) atom
        WHERE
          (atom->>'type' = 'salary_floor'
             AND (atom->>'value')::numeric > coalesce(t.expected_salary_max, 0))
          OR
          (atom->>'type' = 'min_qualification'
             AND public.edu_rank(atom->>'value') > public.edu_rank(t.education_level))
          OR
          (atom->>'type' = 'required_certification'
             AND NOT (t.skills @> ARRAY[atom->>'value'])
             AND NOT (coalesce(t.parsed_resume->'certifications', '[]'::jsonb) ? (atom->>'value'))
          )
          OR
          (atom->>'type' = 'industry_exclude'
             AND (atom->'value') ?| array(
               select jsonb_array_elements_text(coalesce(t.parsed_resume->'industries', '[]'::jsonb))
             )
          )
      )
    )

    -- ── 14. v2: talent-side NN atoms ─────────────────────────────────────
    AND (
      jsonb_array_length(coalesce(t.priority_concerns_atoms, '[]'::jsonb)) = 0
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(t.priority_concerns_atoms) atom
        WHERE
          (atom->>'type' = 'salary_floor'
             AND (atom->>'value')::numeric > coalesce(p_salary_max, 0))
          OR
          (atom->>'type' = 'company_size'
             AND coalesce(p_hm_company_size, '') <> ''
             AND NOT ((atom->'value') ? p_hm_company_size)
          )
          OR
          (atom->>'type' = 'industry_only'
             AND coalesce(p_role_industry, '') <> ''
             AND NOT ((atom->'value') ? p_role_industry)
          )
      )
    )

  ORDER BY t.feedback_score DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_candidates TO service_role;
