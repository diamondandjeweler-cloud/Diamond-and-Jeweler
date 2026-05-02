-- 0071_hm_demographics_hiring_details.sql
--
-- Adds demographic + hiring-process fields to hiring_managers so the
-- platform can perform cultural-alignment matching on both sides of a match.
-- Also adds cultural_alignment_tags jsonb to both sides for future scoring.

-- ── hiring_managers new columns ───────────────────────────────────────────────

ALTER TABLE hiring_managers
  ADD COLUMN IF NOT EXISTS race                  text,
  ADD COLUMN IF NOT EXISTS religion              text,
  ADD COLUMN IF NOT EXISTS languages             text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location_matters      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_postcode     text,
  ADD COLUMN IF NOT EXISTS budget_approved       text,     -- 'yes' | 'pending' | 'unknown'
  ADD COLUMN IF NOT EXISTS deadline_to_fill      date,
  ADD COLUMN IF NOT EXISTS salary_flex           boolean,
  ADD COLUMN IF NOT EXISTS failure_at_90_days    text,
  ADD COLUMN IF NOT EXISTS role_constraints      jsonb   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cultural_alignment_tags jsonb DEFAULT '{}';

-- role_constraints stores operational hard-requirements that mirror talent deal_breakers:
-- {
--   "requires_driving_license": false,
--   "requires_weekends": false,
--   "requires_travel": false,
--   "requires_night_shifts": false,
--   "requires_relocation": false,
--   "onsite_only": false,
--   "requires_own_transport": false,
--   "has_commission": false
-- }

-- cultural_alignment_tags is a computed-or-stored alignment score bag.
-- Initially empty; populated by the matching engine at query time.

-- ── talents new column ────────────────────────────────────────────────────────

ALTER TABLE talents
  ADD COLUMN IF NOT EXISTS cultural_alignment_tags jsonb DEFAULT '{}';

-- ── system_config: add cultural + language matching weights ──────────────────

UPDATE system_config
SET value = value || '{
  "weight_language_match":      0.08,
  "weight_cultural_alignment":  0.05,
  "weight_race_match":          0.03,
  "weight_religion_match":      0.02
}'::jsonb
WHERE key = 'matching_weights';
