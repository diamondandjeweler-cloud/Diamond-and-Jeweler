-- 0091_lifechart_diversity_v2.sql
--
-- Relocate life-chart compat from a hard filter to a "2 + 1 diversity" rule
-- applied at proposal time. Hidden behind a feature flag so behaviour is
-- unchanged until the flag is flipped.
--
-- Changes:
--   1. system_config: add lifechart_diversity_v2_enabled boolean (default false).
--   2. roles: add team_member_birth_years int[] for HM-supplied colleague
--      birth years (captured at PostRole as team-dynamic reference data).
--   3. get_match_candidates: drop §8 (life-chart 'bad' join) so bad-bucket
--      talents now reach the scoring stage. The Edge Function decides what
--      to do with them based on the flag. p_hm_character is retained so the
--      caller signature stays stable.

-- ── 1. Feature flag ──────────────────────────────────────────────────────────
INSERT INTO system_config (key, value)
VALUES ('lifechart_diversity_v2_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 2. Team-member birth years on roles ─────────────────────────────────────
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS team_member_birth_years integer[];

COMMENT ON COLUMN roles.team_member_birth_years IS
  'Birth years of colleagues the new hire will work directly with. Captured at PostRole; used as team-dynamic reference data for compatibility analysis.';

-- ── 3. Recreate get_match_candidates without the life-chart hard filter ─────
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
ROWS 200
AS $$
  -- p_hm_character retained for signature stability; no longer used as a filter.
  -- Life-chart bucket is now applied at the Edge Function selection stage.
  SELECT t.id AS talent_id
  FROM   talents t
  JOIN   profiles pr ON pr.id = t.profile_id
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

    -- ── 8. (removed) Life-chart filter — handled at Edge Function ─────────

    -- ── 9. Already matched to this role ───────────────────────────────────
    AND (
      p_excluded_ids IS NULL
      OR t.id != ALL(p_excluded_ids)
    )

  ORDER BY t.feedback_score DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_match_candidates TO service_role;
