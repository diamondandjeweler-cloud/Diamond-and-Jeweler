-- 0086_proactive_growth_nudge.sql
-- ============================================================================
-- Module 4 — Proactive monthly growth-opportunity nudge.
--
-- Sends opt-in talents a monthly notification listing 3 best-fit active roles
-- when an internal eligibility signal fires. The eligibility signal blends
-- a region-configurable age weight with the existing yearly-fortune score.
-- Public copy is role-neutral ("opportunities matched to your profile") —
-- never references age, BaZi, fortune, or career arc.
--
-- Privacy posture:
--   - growth_nudges_opt_in defaults FALSE; users explicitly opt in
--   - Eligibility logic + thresholds live behind security-definer RPCs
--     callable only by service_role (cron, edge fns)
--   - proactive_nudge_config is admin-readable only
--   - Region gate: each region has its own config row; disabled regions skip
--     the cohort entirely (zero traffic in EU/UK by default)
-- ============================================================================

-- ---- talent opt-in + region columns ---------------------------------------
ALTER TABLE public.talents
  ADD COLUMN IF NOT EXISTS growth_nudges_opt_in    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS region_code             TEXT        NOT NULL DEFAULT 'MY',
  ADD COLUMN IF NOT EXISTS last_growth_nudge_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS growth_nudge_snooze_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_talents_growth_opt_in
  ON public.talents(growth_nudges_opt_in)
  WHERE growth_nudges_opt_in;

-- ---- nudge_history --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nudge_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id     UUID NOT NULL REFERENCES public.talents(id) ON DELETE CASCADE,
  nudge_type    TEXT NOT NULL,                              -- 'growth_opportunity' | (future)
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  snoozed_until TIMESTAMPTZ,
  channel       TEXT NOT NULL DEFAULT 'email',
  payload_summary JSONB NOT NULL DEFAULT '{}'::JSONB,        -- e.g. { role_ids: [...], count: 3 }
  outbox_id     UUID REFERENCES public.notification_outbox(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nudge_history_talent
  ON public.nudge_history(talent_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_nudge_history_type_sent
  ON public.nudge_history(nudge_type, sent_at DESC);

ALTER TABLE public.nudge_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nudge_history_admin_all ON public.nudge_history;
CREATE POLICY nudge_history_admin_all
  ON public.nudge_history
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS nudge_history_self_select ON public.nudge_history;
CREATE POLICY nudge_history_self_select
  ON public.nudge_history
  FOR SELECT TO authenticated
  USING (
    talent_id IN (
      SELECT id FROM public.talents WHERE profile_id = auth.uid()
    )
  );

-- ---- proactive_nudge_config (admin-only, region-keyed) --------------------
CREATE TABLE IF NOT EXISTS public.proactive_nudge_config (
  region_code              TEXT PRIMARY KEY,
  enabled                  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Age weighting (no hard cutoff): weight = 1 below cutoff, then ramps to floor over `age_ramp_years`.
  age_cutoff               INTEGER NOT NULL DEFAULT 40,
  age_ramp_years           INTEGER NOT NULL DEFAULT 10,
  age_weight_floor         NUMERIC(4,3) NOT NULL DEFAULT 0.000,    -- 0 = silenced after cutoff+ramp
  -- Score blending
  score_threshold          NUMERIC(5,2) NOT NULL DEFAULT 70.00,    -- final eligibility threshold
  cooldown_days            INTEGER NOT NULL DEFAULT 30,
  max_jobs_per_nudge       INTEGER NOT NULL DEFAULT 3,
  notes                    TEXT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proactive_nudge_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proactive_nudge_config_admin_all ON public.proactive_nudge_config;
CREATE POLICY proactive_nudge_config_admin_all
  ON public.proactive_nudge_config
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed: enable MY only by default. Other regions disabled until legal review.
INSERT INTO public.proactive_nudge_config (region_code, enabled, age_cutoff, age_ramp_years, age_weight_floor, score_threshold, cooldown_days, max_jobs_per_nudge, notes)
VALUES
  ('MY', TRUE,  40, 10, 0.000, 70.00, 30, 3, 'Default region. Opt-in only.'),
  ('SG', FALSE, 40, 10, 0.000, 70.00, 30, 3, 'Disabled — TAFEP review pending.'),
  ('ID', FALSE, 40, 10, 0.000, 70.00, 30, 3, 'Disabled — local labour-law review pending.'),
  ('TH', FALSE, 40, 10, 0.000, 70.00, 30, 3, 'Disabled — local labour-law review pending.'),
  ('VN', FALSE, 40, 10, 0.000, 70.00, 30, 3, 'Disabled — local labour-law review pending.'),
  ('EU', FALSE, 40, 10, 0.000, 70.00, 30, 3, 'Disabled — GDPR Art.22 review required.'),
  ('GB', FALSE, 40, 10, 0.000, 70.00, 30, 3, 'Disabled — Equality Act review required.')
ON CONFLICT (region_code) DO NOTHING;

-- ---- internal helper: age-weighting (continuous, no smoking-gun cutoff) ---
CREATE OR REPLACE FUNCTION public.growth_age_weight(
  p_age      INTEGER,
  p_cutoff   INTEGER,
  p_ramp     INTEGER,
  p_floor    NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_excess INTEGER;
BEGIN
  IF p_age IS NULL THEN RETURN 1.0; END IF;
  IF p_age <= p_cutoff THEN RETURN 1.0; END IF;
  v_excess := p_age - p_cutoff;
  IF v_excess >= p_ramp THEN RETURN p_floor; END IF;
  -- linear ramp from 1.0 → floor over p_ramp years
  RETURN 1.0 - ((1.0 - p_floor) * v_excess::NUMERIC / GREATEST(p_ramp, 1));
END $$;

REVOKE ALL ON FUNCTION public.growth_age_weight FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.growth_age_weight TO service_role;

-- ---- list candidate talents for growth nudge (service-role only) ----------
-- Pre-filters by opt-in, region enabled, cooldown, snooze, and the cheap
-- fortune_score threshold. Returns the encrypted DOB + region config so the
-- caller (proactive-job-push edge fn) can decrypt + apply the age weight
-- and final eligibility — keeping decrypt_dob calls in service-role context
-- (matches the monthly-fortune pattern) and avoiding chained SECURITY DEFINER
-- through the encryption boundary.
CREATE OR REPLACE FUNCTION public.list_growth_nudge_candidates()
RETURNS TABLE (
  talent_id            UUID,
  profile_id           UUID,
  region_code          TEXT,
  encrypted_dob        BYTEA,
  fortune_score        NUMERIC,
  age_cutoff           INTEGER,
  age_ramp_years       INTEGER,
  age_weight_floor     NUMERIC,
  score_threshold      NUMERIC,
  max_jobs_per_nudge   INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
BEGIN
  RETURN QUERY
  WITH cfg AS (
    SELECT * FROM public.proactive_nudge_config WHERE enabled
  )
  SELECT
    t.id,
    t.profile_id,
    t.region_code,
    t.date_of_birth_encrypted,
    lcyf.fortune_score,
    c.age_cutoff,
    c.age_ramp_years,
    c.age_weight_floor,
    c.score_threshold,
    c.max_jobs_per_nudge
  FROM public.talents t
  JOIN cfg c ON c.region_code = t.region_code
  LEFT JOIN public.life_chart_yearly_fortune lcyf
    ON lcyf.profile_id = t.profile_id AND lcyf.fortune_year = v_year
  WHERE t.growth_nudges_opt_in = TRUE
    AND t.is_open_to_offers   = TRUE
    AND t.date_of_birth_encrypted IS NOT NULL
    AND (t.growth_nudge_snooze_until IS NULL OR t.growth_nudge_snooze_until <= now())
    AND (
      t.last_growth_nudge_at IS NULL
      OR t.last_growth_nudge_at < now() - (c.cooldown_days || ' days')::INTERVAL
    )
    AND lcyf.fortune_score IS NOT NULL
    AND lcyf.fortune_score >= (c.score_threshold * 0.6);   -- pre-filter; final threshold applied post age-weight
END $$;

REVOKE ALL ON FUNCTION public.list_growth_nudge_candidates FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_growth_nudge_candidates TO service_role;

-- ---- pick top-N active roles for a talent ---------------------------------
-- Simple ranking: salary band overlap (1pt) + required_traits ∩ derived_tags
-- (1pt per match). Active roles only. Future revs can plug into match-generate.
CREATE OR REPLACE FUNCTION public.pick_top_jobs_for_talent(
  p_talent_id UUID,
  p_limit     INTEGER DEFAULT 3
)
RETURNS TABLE (
  role_id      UUID,
  title        TEXT,
  location     TEXT,
  salary_min   INTEGER,
  salary_max   INTEGER,
  rank_score   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH t AS (
    SELECT
      tt.id,
      tt.expected_salary_min,
      tt.expected_salary_max,
      COALESCE(
        ARRAY(
          SELECT jsonb_array_elements_text(tt.derived_tags)
          WHERE jsonb_typeof(tt.derived_tags) = 'array'
        ),
        ARRAY[]::TEXT[]
      ) AS tags
    FROM public.talents tt
    WHERE tt.id = p_talent_id
  )
  SELECT
    r.id,
    r.title,
    r.location,
    r.salary_min,
    r.salary_max,
    (
      CASE
        WHEN r.salary_min IS NULL OR r.salary_max IS NULL THEN 0
        WHEN (SELECT expected_salary_min FROM t) IS NULL THEN 0
        WHEN r.salary_min <= (SELECT expected_salary_max FROM t)
         AND r.salary_max >= (SELECT expected_salary_min FROM t) THEN 1
        ELSE 0
      END
      +
      cardinality(
        ARRAY(
          SELECT UNNEST(r.required_traits)
          INTERSECT
          SELECT UNNEST((SELECT tags FROM t))
        )
      )::NUMERIC
    ) AS rank_score
  FROM public.roles r
  WHERE r.status = 'active'
  ORDER BY rank_score DESC, r.created_at DESC
  LIMIT p_limit;
END $$;

REVOKE ALL ON FUNCTION public.pick_top_jobs_for_talent FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_top_jobs_for_talent TO service_role;

-- ---- record_growth_nudge: bump cooldown + log -----------------------------
CREATE OR REPLACE FUNCTION public.record_growth_nudge(
  p_talent_id   UUID,
  p_outbox_id   UUID,
  p_role_ids    UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.nudge_history (talent_id, nudge_type, payload_summary, outbox_id)
  VALUES (
    p_talent_id,
    'growth_opportunity',
    jsonb_build_object('role_ids', to_jsonb(p_role_ids), 'count', cardinality(p_role_ids)),
    p_outbox_id
  )
  RETURNING id INTO v_id;

  UPDATE public.talents
  SET last_growth_nudge_at = now()
  WHERE id = p_talent_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.record_growth_nudge FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_growth_nudge TO service_role;

-- ---- talent self-service snooze RPC ---------------------------------------
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
  RETURN v_until;
END $$;

REVOKE ALL ON FUNCTION public.snooze_growth_nudges FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snooze_growth_nudges TO authenticated;

COMMENT ON TABLE  public.nudge_history          IS 'Audit + cooldown log for proactive nudges (Module 4).';
COMMENT ON TABLE  public.proactive_nudge_config IS 'Region-keyed config for proactive nudges. Admin-only.';
COMMENT ON COLUMN public.talents.growth_nudges_opt_in IS 'Talent opt-in for monthly opportunity nudges. Defaults FALSE.';
