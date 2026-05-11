-- 0107_team_fit_v2.sql
--
-- Team-fit scoring v2.
--
-- Replaces the year-only colleague capture with full character codes derived
-- from DOB + gender at PostRole submit time (same lookup used for talents and
-- HMs). The matching engine averages the per-colleague bucket scores into a
-- new team_fit dimension. Birth years alone weren't enough — the solar-year
-- character mapping is gender-aware.
--
-- Changes:
--   1. roles: drop team_member_birth_years (year-only); add team_member_characters
--      (derived character codes, one per colleague).
--   2. system_config: flip lifechart_diversity_v2_enabled to true so the
--      team-dynamic section surfaces on PostRole by default.
--   3. system_config: add weight_team_fit weight for the new dimension.

-- ── 1. roles.team_member_characters ──────────────────────────────────────────
ALTER TABLE roles
  DROP COLUMN IF EXISTS team_member_birth_years;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS team_member_characters text[];

ALTER TABLE roles
  DROP CONSTRAINT IF EXISTS roles_team_member_characters_check;
ALTER TABLE roles
  ADD CONSTRAINT roles_team_member_characters_check
    CHECK (
      team_member_characters IS NULL
      OR (
        array_length(team_member_characters, 1) IS NULL
        OR team_member_characters <@ ARRAY['E','W','F','E+','E-','W+','W-','G+','G-']::text[]
      )
    );

COMMENT ON COLUMN roles.team_member_characters IS
  'Derived character codes (E/W/F/E+/E-/W+/W-/G+/G-) for each existing colleague the hire will work with. Computed at PostRole submit from DOB + gender. Used as input to the team_fit scoring dimension. Colleague DOBs are never stored.';

-- ── 2. Enable diversity v2 flag ──────────────────────────────────────────────
INSERT INTO system_config (key, value)
VALUES ('lifechart_diversity_v2_enabled', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb;

-- ── 3. Team-fit weight ───────────────────────────────────────────────────────
INSERT INTO system_config (key, value)
VALUES ('weight_team_fit', '0.10'::jsonb)
ON CONFLICT (key) DO NOTHING;
