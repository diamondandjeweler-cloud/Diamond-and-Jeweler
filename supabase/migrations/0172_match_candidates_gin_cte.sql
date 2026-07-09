-- Migration 0172: get_match_candidates — GIN-first via MATERIALIZED survivor CTE
-- ============================================================================
-- The matcher hot-path RPC ORDER BY feedback_score DESC LIMIT let the planner
-- walk the ordered scan and filter per-row, ignoring the purpose-built GIN
-- indexes (skills/languages/atoms/employment_type). Wrapping the IDENTICAL WHERE
-- in a MATERIALIZED CTE (optimization barrier) forces the selective GIN bitmap-AND
-- to run BEFORE the sort/limit — restoring index usage at 1M-talent scale.
-- Output is byte-identical (same predicates, same ORDER BY + LIMIT): proven by an
-- old-vs-new set-diff across 8 real parameter combos (all sym_diff=0). Behaviour-
-- preserving; only the execution plan changes. Reversible (re-CREATE the flat body).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_match_candidates(p_employment_type text DEFAULT NULL::text, p_salary_max integer DEFAULT NULL::integer, p_hm_character text DEFAULT NULL::text, p_requires_weekend boolean DEFAULT false, p_requires_driving boolean DEFAULT false, p_requires_travel boolean DEFAULT false, p_has_night_shifts boolean DEFAULT false, p_requires_own_car boolean DEFAULT false, p_requires_relocation boolean DEFAULT false, p_requires_overtime boolean DEFAULT false, p_is_commission boolean DEFAULT false, p_work_arrangement text DEFAULT NULL::text, p_required_work_auth text[] DEFAULT NULL::text[], p_excluded_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 500, p_required_skills text[] DEFAULT NULL::text[], p_languages_required jsonb DEFAULT NULL::jsonb, p_min_education text DEFAULT NULL::text, p_role_eligibility text[] DEFAULT NULL::text[], p_role_atoms jsonb DEFAULT NULL::jsonb, p_hm_company_size text DEFAULT NULL::text, p_role_industry text DEFAULT NULL::text)
 RETURNS TABLE(talent_id uuid)
 LANGUAGE sql
 STABLE PARALLEL SAFE ROWS 200
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH survivors AS MATERIALIZED (
    SELECT t.id AS talent_id, t.feedback_score AS _fs
  FROM   talents t
  JOIN   profiles pr ON pr.id = t.profile_id
  LEFT JOIN life_chart_compatibility lcc
         ON lcc.hm_character     = p_hm_character
        AND lcc.talent_character = t.life_chart_character
  WHERE
    -- â”€â”€ 1. Basic availability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    t.is_open_to_offers = true
    AND pr.is_banned    = false
    AND (t.profile_expires_at IS NULL OR t.profile_expires_at >= now())

    -- â”€â”€ 2. Employment type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    AND (
      p_employment_type IS NULL
      OR t.employment_type_preferences @> ARRAY[p_employment_type]
    )

    -- â”€â”€ 3. Salary max (soft floor) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    AND (
      p_salary_max IS NULL
      OR t.expected_salary_min IS NULL
      OR t.expected_salary_min <= p_salary_max
    )

    -- â”€â”€ 4. Deal-breaker flags (now via generated cols, not JSON extract) â”€
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

    -- â”€â”€ 5. Salary hard floor (now via generated col) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    AND (
      p_salary_max IS NULL
      OR t.db_min_salary_hard IS NULL
      OR t.db_min_salary_hard <= p_salary_max
    )

    -- â”€â”€ 6. Work authorization (per-role override of HM default) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    -- â”€â”€ 7. Commission vs fixed-salary conflict â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    AND (
      NOT p_is_commission
      OR t.salary_structure_preference IS DISTINCT FROM 'fixed_only'
    )

    -- â”€â”€ 8. BaZi â€” exclude 'bad' character pairs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    AND (
      p_hm_character IS NULL
      OR t.life_chart_character IS NULL
      OR COALESCE(lcc.bucket, 'neutral') != 'bad'
    )

    -- â”€â”€ 9. Already matched â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    AND (
      p_excluded_ids IS NULL
      OR t.id != ALL(p_excluded_ids)
    )

    -- â”€â”€ 10. v2: required_skills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    AND (
      p_required_skills IS NULL
      OR array_length(p_required_skills, 1) IS NULL
      OR t.skills @> p_required_skills
    )

    -- â”€â”€ 11. v2: min education â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    AND (
      p_min_education IS NULL
      OR p_min_education = 'none'
      OR public.edu_rank(t.education_level) >= public.edu_rank(p_min_education)
    )

    -- â”€â”€ 12. v2: required language codes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    -- â”€â”€ 13. v2: role-side NN atoms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    -- â”€â”€ 14. v2: talent-side NN atoms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  )
  SELECT talent_id FROM survivors
  ORDER BY _fs DESC NULLS LAST
  LIMIT p_limit;
$function$
