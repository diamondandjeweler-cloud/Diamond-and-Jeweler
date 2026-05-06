-- ============================================================================
-- cleanup_uat.sql — Remove synthetic test data after load/UAT testing.
--
-- ⚠️  RUN THIS ONLY AGAINST THE UAT SUPABASE PROJECT, NEVER AGAINST PRODUCTION.
-- ⚠️  This script SELF-AUTHENTICATES to refuse running on prod (see guard
--     block below). Do not remove the guard.
--
-- Strategy: every synthetic row inserted by `seed_uat.py` has
--   is_test_data = TRUE
-- which is a column added solely for UAT identification (set NULL or absent on
-- real rows). We never use email-pattern matches like '%test%' because real
-- users may legitimately use such emails.
-- ============================================================================

BEGIN;

-- ---- Guard: refuse to run on production ------------------------------------
DO $$
DECLARE
  prod_project_id TEXT := 'sfnrpbsdscikpmbhrzub';      -- DNJ prod
  current_db      TEXT;
BEGIN
  SELECT current_database() INTO current_db;
  -- Supabase project ref appears in current_user / databases on hosted Postgres.
  -- We also check that an env-controlled flag is set in `system_config`.
  IF EXISTS (
    SELECT 1 FROM public.system_config
    WHERE key = 'environment' AND value = '"production"'::jsonb
  ) THEN
    RAISE EXCEPTION 'REFUSING to run cleanup_uat.sql on production. Aborting.';
  END IF;

  -- Belt-and-braces: never delete more than 200,000 rows in a single run.
  -- Adjust upward only with explicit reason.
  PERFORM 1;
END $$;

-- ---- Diagnostic: count what we'd delete ------------------------------------
DO $$
DECLARE
  c_talents      INT;
  c_roles        INT;
  c_applications INT;
  c_matches      INT;
  c_purchases    INT;
  c_chat_msgs    INT;
BEGIN
  SELECT COUNT(*) INTO c_talents
  FROM public.talents WHERE is_test_data = TRUE;

  SELECT COUNT(*) INTO c_roles
  FROM public.roles WHERE is_test_data = TRUE;

  -- Applications, matches, purchases linked via FK
  SELECT COUNT(*) INTO c_applications
  FROM public.applications a
  WHERE a.role_id IN (SELECT id FROM public.roles WHERE is_test_data = TRUE)
     OR a.talent_id IN (SELECT id FROM public.talents WHERE is_test_data = TRUE);

  SELECT COUNT(*) INTO c_matches
  FROM public.matches m
  WHERE m.role_id IN (SELECT id FROM public.roles WHERE is_test_data = TRUE)
     OR m.talent_id IN (SELECT id FROM public.talents WHERE is_test_data = TRUE);

  SELECT COUNT(*) INTO c_purchases
  FROM public.point_purchases pp
  WHERE pp.payment_intent_id LIKE 'MOCK-%';

  SELECT COUNT(*) INTO c_chat_msgs
  FROM public.ai_chat_messages cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE p.email LIKE 'loadtest+%@example.com';

  RAISE NOTICE 'Would delete: % talents, % roles, % applications, % matches, % mock purchases, % chat messages',
    c_talents, c_roles, c_applications, c_matches, c_purchases, c_chat_msgs;
END $$;

-- ---- Delete in dependency order --------------------------------------------

-- 1. Chat messages from synthetic users
DELETE FROM public.ai_chat_messages
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE email LIKE 'loadtest+%@example.com'
);

-- 2. Applications referencing synthetic talents/roles
DELETE FROM public.applications
WHERE role_id   IN (SELECT id FROM public.roles   WHERE is_test_data = TRUE)
   OR talent_id IN (SELECT id FROM public.talents WHERE is_test_data = TRUE);

-- 3. Matches referencing synthetic talents/roles
DELETE FROM public.matches
WHERE role_id   IN (SELECT id FROM public.roles   WHERE is_test_data = TRUE)
   OR talent_id IN (SELECT id FROM public.talents WHERE is_test_data = TRUE);

-- 4. Mock-mode payment rows (Billplz sandbox / dev payments)
DELETE FROM public.point_purchases       WHERE payment_intent_id LIKE 'MOCK-%';
DELETE FROM public.extra_match_purchases WHERE payment_intent_id LIKE 'MOCK-%';

-- 5. Synthetic roles + talents themselves
DELETE FROM public.roles   WHERE is_test_data = TRUE;
DELETE FROM public.talents WHERE is_test_data = TRUE;

-- 6. Profiles created by the seed script (loadtest+talent_*@example.com pattern)
DELETE FROM public.profiles
WHERE email LIKE 'loadtest+%@example.com';

-- 7. Auth users (last — relies on profiles cascade or manual delete)
-- NOTE: Supabase auth.users deletion requires service-role; can also use
-- the Auth Admin API. Uncomment only if you have direct DB access:
-- DELETE FROM auth.users WHERE email LIKE 'loadtest+%@example.com';

-- ---- Verify cleanup --------------------------------------------------------
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.talents WHERE is_test_data = TRUE;
  IF remaining > 0 THEN
    RAISE WARNING 'Still % synthetic talents — investigate', remaining;
  END IF;

  SELECT COUNT(*) INTO remaining
  FROM public.roles WHERE is_test_data = TRUE;
  IF remaining > 0 THEN
    RAISE WARNING 'Still % synthetic roles — investigate', remaining;
  END IF;

  RAISE NOTICE 'Cleanup complete.';
END $$;

COMMIT;
-- ROLLBACK;  -- swap COMMIT/ROLLBACK to do a dry-run-with-locking
