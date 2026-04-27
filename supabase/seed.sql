-- ============================================================
-- BoLe Platform — Seed Data
-- Idempotent: safe to re-run.
-- Run AFTER all migrations in supabase/migrations/.
-- ============================================================

-- ---------- system_config ----------

insert into public.system_config (key, value) values
  ('match_expiry_days',           '5'::jsonb),
  ('refresh_limit_per_role',      '3'::jsonb),
  ('weight_life_chart',           '0.3'::jsonb),
  ('weight_tag_compatibility',    '0.7'::jsonb),
  ('ic_retention_days_after_verify', '30'::jsonb),
  ('ghost_score_threshold',       '3'::jsonb),
  ('waiting_period_thresholds',
    '[{"min_talents":0,"max_talents":500,"days":14},
      {"min_talents":500,"max_talents":2000,"days":7},
      {"min_talents":2000,"max_talents":10000,"days":3},
      {"min_talents":10000,"max_talents":999999,"days":0}]'::jsonb),
  ('launch_mode',                 '"pilot"'::jsonb),  -- 'pilot' | 'public'
  ('resend_from_email',           '"noreply@resend.dev"'::jsonb)
on conflict (key) do nothing;

-- ---------- tag_dictionary ----------

insert into public.tag_dictionary (tag_name, category, weight_multiplier) values
  -- boss expectations (what HMs look for in talent)
  ('self_starter',        'boss_expectation', 1.00),
  ('reliable',            'boss_expectation', 1.00),
  ('collaborator',        'boss_expectation', 1.00),
  ('growth_minded',       'boss_expectation', 1.00),
  ('clear_communicator',  'boss_expectation', 1.00),
  ('detail_oriented',     'boss_expectation', 0.90),
  ('adaptable',           'boss_expectation', 0.90),
  ('customer_focused',    'boss_expectation', 0.90),
  ('analytical',          'boss_expectation', 0.90),
  ('accountable',         'boss_expectation', 1.00),
  -- talent expectations (what talents look for in workplace)
  ('wants_wlb',           'talent_expectation', 1.00),
  ('wants_fair_pay',      'talent_expectation', 1.00),
  ('wants_supportive_boss','talent_expectation', 1.00),
  ('wants_autonomy',      'talent_expectation', 1.00),
  ('wants_growth',        'talent_expectation', 1.00),
  ('wants_stability',     'talent_expectation', 0.90),
  ('wants_recognition',   'talent_expectation', 0.90),
  ('wants_flexibility',   'talent_expectation', 1.00),
  ('wants_mission',       'talent_expectation', 0.90),
  ('wants_team_culture',  'talent_expectation', 0.90)
on conflict (tag_name) do nothing;

-- ---------- market_rate_cache (Malaysia, 2026 baseline) ----------
-- The full benchmark dataset (615 rows across ~14 industries) is loaded by
-- migration 0017_market_rate_cache_seed.sql, sourced from
-- supabase/data/malaysia_salary_benchmarks.csv. Keep seeding logic there
-- rather than duplicating a subset here.

-- ---------- Admin user setup (MANUAL STEP) ----------
-- After creating the admin auth user via Supabase Auth UI / magic link for
-- diamondandjeweler@gmail.com, run the following ONCE to elevate to admin:
--
--   update public.profiles
--   set role = 'admin', onboarding_complete = true
--   where email = 'diamondandjeweler@gmail.com';
--
-- Do NOT hard-code the auth user's UUID in this seed — it is created at signup.
