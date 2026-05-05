-- get_match_candidates
--
-- Single RPC that applies ALL hard filters inside the database before any rows
-- are transferred to the Edge Function.
--
-- Filter stages (in order of cheapest → most selective):
--   1. Basic availability  — is_open_to_offers, is_banned, profile_expires_at
--   2. Employment type     — array contains (GIN index)
--   3. Salary max          — expected_salary_min <= p_salary_max (btree index)
--   4. Deal-breaker flags  — JSONB boolean checks (no_weekend, no_driving, …)
--   5. Salary hard floor   — deal_breakers->min_salary_hard <= p_salary_max
--   6. Work authorization  — talent.work_authorization IN p_required_work_auth
--   7. Commission conflict — salary_structure_preference vs is_commission role
--   8. BaZi               — JOIN life_chart_compatibility WHERE bucket != 'bad'
--   9. Already matched     — exclude p_excluded_ids
--
-- Returns: talent IDs ordered by feedback_score DESC, limited to p_limit rows.
-- The caller fetches full profile rows only for the returned IDs.

CREATE OR REPLACE FUNCTION get_match_candidates(
  p_employment_type    text        DEFAULT NULL,
  p_salary_max         integer     DEFAULT NULL,
  p_hm_character       text        DEFAULT NULL,
  p_requires_weekend   boolean     DEFAULT false,
  p_requires_driving   boolean     DEFAULT false,
  p_requires_travel    boolean     DEFAULT false,
  p_has_night_shifts   boolean     DEFAULT false,
  p_requires_own_car   boolean     DEFAULT false,
  p_requires_relocation boolean    DEFAULT false,
  p_requires_overtime  boolean     DEFAULT false,
  p_is_commission      boolean     DEFAULT false,
  p_work_arrangement   text        DEFAULT NULL,
  p_required_work_auth text[]      DEFAULT NULL,
  p_excluded_ids       uuid[]      DEFAULT NULL,
  p_limit              integer     DEFAULT 500
)
RETURNS TABLE (talent_id uuid)
LANGUAGE sql STABLE
ROWS 200   -- hint to planner: we expect ~200 rows back
AS $$
  SELECT t.id AS talent_id
  FROM   talents t
  JOIN   profiles pr ON pr.id = t.profile_id
  -- BaZi: left-join so talents without a character pass through
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

    -- ── 3. Salary max (soft floor; hard floor handled in §5) ──────────────
    AND (
      p_salary_max IS NULL
      OR t.expected_salary_min IS NULL
      OR t.expected_salary_min <= p_salary_max
    )

    -- ── 4. Deal-breaker flags (JSONB) ─────────────────────────────────────
    -- Logic: only block when BOTH the role requires it AND talent refuses it.
    -- Missing key in JSONB = NULL = IS NOT TRUE = allowed through.
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
    -- remote_only talent: only allow remote or hybrid roles
    AND (
      p_work_arrangement IN ('remote', 'hybrid')
      OR (t.deal_breakers->>'remote_only')::boolean IS NOT TRUE
    )

    -- ── 5. Salary hard floor (from deal_breakers JSONB) ───────────────────
    AND (
      p_salary_max IS NULL
      OR (t.deal_breakers->>'min_salary_hard') IS NULL
      OR (t.deal_breakers->>'min_salary_hard')::integer <= p_salary_max
    )

    -- ── 6. Work authorization whitelist ───────────────────────────────────
    AND (
      p_required_work_auth IS NULL
      OR array_length(p_required_work_auth, 1) IS NULL
      OR t.work_authorization = ANY(p_required_work_auth)
    )

    -- ── 7. Commission vs fixed-salary conflict ────────────────────────────
    AND (
      NOT p_is_commission
      OR t.salary_structure_preference IS DISTINCT FROM 'fixed_only'
    )

    -- ── 8. BaZi — exclude 'bad' character pairs ───────────────────────────
    -- Pass-through when either side has no character set (NULL = no data yet).
    AND (
      p_hm_character IS NULL
      OR t.life_chart_character IS NULL
      OR COALESCE(lcc.bucket, 'neutral') != 'bad'
    )

    -- ── 9. Already matched to this role ───────────────────────────────────
    AND (
      p_excluded_ids IS NULL
      OR t.id != ALL(p_excluded_ids)
    )

  ORDER BY t.feedback_score DESC NULLS LAST
  LIMIT p_limit;
$$;

-- Allow the Edge Function (service role) to call this RPC.
GRANT EXECUTE ON FUNCTION get_match_candidates TO service_role;
