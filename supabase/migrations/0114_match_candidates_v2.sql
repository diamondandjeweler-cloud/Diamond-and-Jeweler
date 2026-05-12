-- 0114_match_candidates_v2.sql
--
-- Extends get_match_candidates with the new hard filters introduced by 0112:
--   • Required skills        (role.required_skills @> all in talent.skills)
--   • Min education          (role.min_education_level vs talent.education_level)
--   • Required language codes(talent must speak every required language code,
--                              level handled as a soft score in TS)
--   • Per-role eligibility   (role.eligibility_work_auth overrides HM default)
--   • Role's NN atoms        (salary_floor, min_qualification, required_cert,
--                              industry_exclude)
--   • Talent's NN atoms      (salary_floor vs role salary_max, company_size,
--                              industry_only)
--
-- Soft / score-only filters stay in match-core.ts:
--   skill overlap %, language level gap, environment Jaccard, open_to overlap,
--   schedule fit, free_text atoms (display-only until embedding phase).

-- Drop the old 15-param signature so the new 22-param overload doesn't
-- collide with it at call sites (Postgres can't pick between overloads with
-- the same name and overlapping defaults).
DROP FUNCTION IF EXISTS public.get_match_candidates(
  text, integer, text, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, text, text[], uuid[], integer
);

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
  -- v2 additions
  p_required_skills     text[]      DEFAULT NULL,
  p_languages_required  jsonb       DEFAULT NULL,
  p_min_education       text        DEFAULT NULL,
  p_role_eligibility    text[]      DEFAULT NULL,
  p_role_atoms          jsonb       DEFAULT NULL,
  p_hm_company_size     text        DEFAULT NULL,
  p_role_industry       text        DEFAULT NULL
)
RETURNS TABLE (talent_id uuid)
LANGUAGE sql STABLE
ROWS 200
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

    -- ── 4. Deal-breaker flags ─────────────────────────────────────────────
    AND (NOT p_requires_weekend
         OR (t.deal_breakers->>'no_weekend_work')::boolean IS NOT TRUE)
    AND (NOT p_requires_driving
         OR (t.deal_breakers->>'no_driving_license')::boolean IS NOT TRUE)
    AND (NOT p_requires_travel
         OR (t.deal_breakers->>'no_travel')::boolean IS NOT TRUE)
    AND (NOT p_has_night_shifts
         OR (t.deal_breakers->>'no_night_shifts')::boolean IS NOT TRUE)
    AND (NOT p_requires_own_car
         OR (t.deal_breakers->>'no_own_car')::boolean IS NOT TRUE)
    AND (NOT p_requires_relocation
         OR (t.deal_breakers->>'no_relocation')::boolean IS NOT TRUE)
    AND (NOT p_requires_overtime
         OR (t.deal_breakers->>'no_overtime')::boolean IS NOT TRUE)
    AND (NOT p_is_commission
         OR (t.deal_breakers->>'no_commission_only')::boolean IS NOT TRUE)
    AND (
      p_work_arrangement IN ('remote', 'hybrid')
      OR (t.deal_breakers->>'remote_only')::boolean IS NOT TRUE
    )

    -- ── 5. Salary hard floor ──────────────────────────────────────────────
    AND (
      p_salary_max IS NULL
      OR (t.deal_breakers->>'min_salary_hard') IS NULL
      OR (t.deal_breakers->>'min_salary_hard')::integer <= p_salary_max
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

    -- ── 10. v2: required_skills (talent must have ALL) ───────────────────
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

    -- ── 12. v2: required language codes (level handled in TS scorer) ────
    -- Each required language code must appear in talent.languages_proficiency.
    -- Backwards-compat: legacy talents.languages (jsonb array of codes) counts too.
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

    -- ── 13. v2: role-side NN atoms vs talent profile ─────────────────────
    AND (
      p_role_atoms IS NULL
      OR jsonb_array_length(p_role_atoms) = 0
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_role_atoms) atom
        WHERE
          -- HM salary_floor: talent's expected_salary_max must meet it
          (atom->>'type' = 'salary_floor'
             AND (atom->>'value')::numeric > coalesce(t.expected_salary_max, 0))
          OR
          -- HM min_qualification: talent edu rank must meet
          (atom->>'type' = 'min_qualification'
             AND public.edu_rank(atom->>'value') > public.edu_rank(t.education_level))
          OR
          -- HM required_certification: must be in talent.skills
          --  (parsed_resume.certifications also accepted for legacy data)
          (atom->>'type' = 'required_certification'
             AND NOT (t.skills @> ARRAY[atom->>'value'])
             AND NOT (coalesce(t.parsed_resume->'certifications', '[]'::jsonb) ? (atom->>'value'))
          )
          OR
          -- HM industry_exclude: reject if any excluded industry overlaps
          (atom->>'type' = 'industry_exclude'
             AND (atom->'value') ?| array(
               select jsonb_array_elements_text(coalesce(t.parsed_resume->'industries', '[]'::jsonb))
             )
          )
      )
    )

    -- ── 14. v2: talent-side NN atoms vs role ─────────────────────────────
    AND (
      jsonb_array_length(coalesce(t.priority_concerns_atoms, '[]'::jsonb)) = 0
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(t.priority_concerns_atoms) atom
        WHERE
          -- Talent salary_floor: role.salary_max must meet it
          (atom->>'type' = 'salary_floor'
             AND (atom->>'value')::numeric > coalesce(p_salary_max, 0))
          OR
          -- Talent company_size: role's HM company size must be in the list
          (atom->>'type' = 'company_size'
             AND coalesce(p_hm_company_size, '') <> ''
             AND NOT ((atom->'value') ? p_hm_company_size)
          )
          OR
          -- Talent industry_only: role industry must be in the list
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
