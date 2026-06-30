-- 0171_interview_rounds_rls_denorm.deny-suite.sql
--
-- DENY-SUITE for the B4 interview_rounds RLS denormalization (0171).
-- This is the proof that MUST pass on a SHADOW DB before the migration ships.
-- RLS regressions on this table caused prior 503s — do not skip.
--
-- ============================================================================
-- HOW TO RUN (local shadow DB)
-- ============================================================================
--   1. Start a throwaway local stack:
--          supabase start
--   2. Apply all migrations PLUS the staged 0171 onto it. Easiest:
--        - temporarily copy 0171_interview_rounds_rls_denorm.sql into
--          supabase/migrations/ (renumbered to the next free number), then
--              supabase db reset
--        - OR apply it directly to the running shadow DB:
--              psql "$(supabase status -o json | jq -r .DB_URL)" \
--                   -f supabase/staged-migrations/0171_interview_rounds_rls_denorm.sql
--   3. Run THIS file against the same DB:
--          psql "$(supabase status -o json | jq -r .DB_URL)" \
--               -f supabase/staged-migrations/0171_interview_rounds_rls_denorm.deny-suite.sql
--   4. Expect the final line to print:  ALL INTERVIEW_ROUNDS RLS DENY ASSERTIONS PASSED
--      Any failed assertion RAISEs EXCEPTION and aborts (psql exits non-zero).
--
-- This suite mimics RLS the way PostgREST does: it sets the role to
-- `authenticated` / `anon` and sets request.jwt.claims.sub = <profile uuid>,
-- which is what auth.uid() reads. It runs entirely inside one rolled-back
-- transaction, so it leaves NO data behind.
--
-- It exercises:
--   (a) each user SELECTs ONLY their own interview_rounds row(s);
--   (b) neither user can SELECT the other's row(s) — the cross-tenant deny;
--   (c) anon sees NONE.
-- Plus the denorm-correctness invariant (columns equal the live join) and a
-- direct check that the new trigger populates identities on fresh inserts.
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  -- profiles (auth identities)
  hm_a_pid     uuid := gen_random_uuid();  -- hiring manager A's auth uid
  hm_b_pid     uuid := gen_random_uuid();  -- hiring manager B's auth uid
  tal_a_pid    uuid := gen_random_uuid();  -- talent A's auth uid
  tal_b_pid    uuid := gen_random_uuid();  -- talent B's auth uid

  company_a    uuid;
  company_b    uuid;
  hm_a_id      uuid;
  hm_b_id      uuid;
  tal_a_id     uuid;
  tal_b_id     uuid;
  role_a_id    uuid;
  role_b_id    uuid;
  match_a_id   uuid;  -- HM A  <-> Talent A
  match_b_id   uuid;  -- HM B  <-> Talent B
  round_a_id   uuid;
  round_b_id   uuid;

  n            int;
  v_hm_denorm  uuid;
  v_tal_denorm uuid;
BEGIN
  -- ----------------------------------------------------------------
  -- FIXTURE (created as table owner / superuser, RLS bypassed for setup)
  -- ----------------------------------------------------------------
  -- public.profiles.id is FK → auth.users(id), so the auth.users rows MUST
  -- exist first. We insert the minimal columns Supabase's auth schema requires.
  -- (instance_id NULL + an email is enough for a fixture identity; these never
  -- log in.) Wrapped defensively in case columns differ across pg versions.
  INSERT INTO auth.users (id, email, aud, role)
  VALUES
    (hm_a_pid,  'hm_a@deny.test',  'authenticated', 'authenticated'),
    (hm_b_pid,  'hm_b@deny.test',  'authenticated', 'authenticated'),
    (tal_a_pid, 'tal_a@deny.test', 'authenticated', 'authenticated'),
    (tal_b_pid, 'tal_b@deny.test', 'authenticated', 'authenticated');

  -- A handle_new_user trigger (0155/0001) may auto-create the profiles rows on
  -- the auth.users insert above. UPSERT so we set the role we need either way.
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES
    (hm_a_pid,  'hm_a@deny.test',  'HM A',     'hiring_manager'),
    (hm_b_pid,  'hm_b@deny.test',  'HM B',     'hiring_manager'),
    (tal_a_pid, 'tal_a@deny.test', 'Talent A', 'talent'),
    (tal_b_pid, 'tal_b@deny.test', 'Talent B', 'talent')
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;

  -- companies: registration_number (unique not null) + created_by (not null)
  -- are required by 0001.
  INSERT INTO public.companies (name, registration_number, primary_hr_email, created_by)
  VALUES ('Company A', 'REG-A-' || gen_random_uuid()::text, 'hr_a@deny.test', hm_a_pid)
  RETURNING id INTO company_a;
  INSERT INTO public.companies (name, registration_number, primary_hr_email, created_by)
  VALUES ('Company B', 'REG-B-' || gen_random_uuid()::text, 'hr_b@deny.test', hm_b_pid)
  RETURNING id INTO company_b;

  INSERT INTO public.hiring_managers (profile_id, company_id, job_title)
  VALUES (hm_a_pid, company_a, 'Head A') RETURNING id INTO hm_a_id;
  INSERT INTO public.hiring_managers (profile_id, company_id, job_title)
  VALUES (hm_b_pid, company_b, 'Head B') RETURNING id INTO hm_b_id;

  INSERT INTO public.talents (profile_id) VALUES (tal_a_pid) RETURNING id INTO tal_a_id;
  INSERT INTO public.talents (profile_id) VALUES (tal_b_pid) RETURNING id INTO tal_b_id;

  INSERT INTO public.roles (hiring_manager_id, title)
  VALUES (hm_a_id, 'Role A') RETURNING id INTO role_a_id;
  INSERT INTO public.roles (hiring_manager_id, title)
  VALUES (hm_b_id, 'Role B') RETURNING id INTO role_b_id;

  -- Matches at a status that allows interview rounds.
  INSERT INTO public.matches (role_id, talent_id, status)
  VALUES (role_a_id, tal_a_id, 'interview_scheduled') RETURNING id INTO match_a_id;
  INSERT INTO public.matches (role_id, talent_id, status)
  VALUES (role_b_id, tal_b_id, 'interview_scheduled') RETURNING id INTO match_b_id;

  -- interview_rounds: insert WITHOUT supplying the denorm columns so we prove
  -- the BEFORE INSERT trigger populates them.
  INSERT INTO public.interview_rounds (match_id, scheduled_at, interview_url)
  VALUES (match_a_id, now() + interval '1 day', 'https://x/a')
  RETURNING id INTO round_a_id;
  INSERT INTO public.interview_rounds (match_id, scheduled_at, interview_url)
  VALUES (match_b_id, now() + interval '1 day', 'https://x/b')
  RETURNING id INTO round_b_id;

  -- ----------------------------------------------------------------
  -- PRECHECK 0: trigger populated the denorm identities correctly.
  -- ----------------------------------------------------------------
  SELECT match_hm_profile_id, match_talent_profile_id
    INTO v_hm_denorm, v_tal_denorm
  FROM public.interview_rounds WHERE id = round_a_id;

  IF v_hm_denorm IS DISTINCT FROM hm_a_pid THEN
    RAISE EXCEPTION 'PRECHECK FAIL: round A match_hm_profile_id = % expected %',
      v_hm_denorm, hm_a_pid;
  END IF;
  IF v_tal_denorm IS DISTINCT FROM tal_a_pid THEN
    RAISE EXCEPTION 'PRECHECK FAIL: round A match_talent_profile_id = % expected %',
      v_tal_denorm, tal_a_pid;
  END IF;
  RAISE NOTICE 'PRECHECK 0 OK: trigger populated denorm identities on insert.';

  -- ----------------------------------------------------------------
  -- PRECHECK 1: denorm columns equal the live join for every row.
  -- ----------------------------------------------------------------
  SELECT count(*) INTO n
  FROM   public.interview_rounds ir
  JOIN   public.matches m          ON m.id  = ir.match_id
  JOIN   public.roles r            ON r.id  = m.role_id
  JOIN   public.hiring_managers hm ON hm.id = r.hiring_manager_id
  JOIN   public.talents t          ON t.id  = m.talent_id
  WHERE  ir.match_hm_profile_id     IS DISTINCT FROM hm.profile_id
     OR  ir.match_talent_profile_id IS DISTINCT FROM t.profile_id;
  IF n <> 0 THEN
    RAISE EXCEPTION 'PRECHECK FAIL: % round(s) have denorm drift vs live join', n;
  END IF;
  RAISE NOTICE 'PRECHECK 1 OK: no denorm drift.';

  -- ================================================================
  -- (a) + (b) Per-user SELECT visibility under RLS, evaluated as the
  -- `authenticated` role with auth.uid() = each user's profile id.
  -- We assert via SECURITY-INVOKER helper run inside set_config'd context.
  -- ================================================================

  -- helper macro: count rows visible to a given uid as `authenticated`.
  -- Implemented inline via a temp function so we can flip role/claims cleanly.
  CREATE TEMP TABLE _deny_results(label text, got int, expected int) ON COMMIT DROP;

  -- HM A: should see ONLY round_a (their own match's round) → 1 total, and
  -- specifically 0 of round_b.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', hm_a_pid, 'role', 'authenticated')::text,
                     true);
  SELECT count(*) INTO n FROM public.interview_rounds;
  INSERT INTO _deny_results VALUES ('HM_A total visible', n, 1);
  SELECT count(*) INTO n FROM public.interview_rounds WHERE id = round_b_id;
  INSERT INTO _deny_results VALUES ('HM_A sees HM_B round (must be 0)', n, 0);
  SELECT count(*) INTO n FROM public.interview_rounds WHERE id = round_a_id;
  INSERT INTO _deny_results VALUES ('HM_A sees own round (must be 1)', n, 1);

  -- Talent A: should see ONLY round_a as well (talent side of match A).
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', tal_a_pid, 'role', 'authenticated')::text,
                     true);
  SELECT count(*) INTO n FROM public.interview_rounds;
  INSERT INTO _deny_results VALUES ('TAL_A total visible', n, 1);
  SELECT count(*) INTO n FROM public.interview_rounds WHERE id = round_b_id;
  INSERT INTO _deny_results VALUES ('TAL_A sees TAL_B round (must be 0)', n, 0);
  SELECT count(*) INTO n FROM public.interview_rounds WHERE id = round_a_id;
  INSERT INTO _deny_results VALUES ('TAL_A sees own round (must be 1)', n, 1);

  -- HM B: only round_b; must NOT see round_a.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', hm_b_pid, 'role', 'authenticated')::text,
                     true);
  SELECT count(*) INTO n FROM public.interview_rounds;
  INSERT INTO _deny_results VALUES ('HM_B total visible', n, 1);
  SELECT count(*) INTO n FROM public.interview_rounds WHERE id = round_a_id;
  INSERT INTO _deny_results VALUES ('HM_B sees HM_A round (must be 0)', n, 0);

  -- Talent B: only round_b; must NOT see round_a.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', tal_b_pid, 'role', 'authenticated')::text,
                     true);
  SELECT count(*) INTO n FROM public.interview_rounds;
  INSERT INTO _deny_results VALUES ('TAL_B total visible', n, 1);
  SELECT count(*) INTO n FROM public.interview_rounds WHERE id = round_a_id;
  INSERT INTO _deny_results VALUES ('TAL_B sees HM_A round (must be 0)', n, 0);

  -- ================================================================
  -- (c) anon sees NONE.
  -- ================================================================
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims',
                     json_build_object('role', 'anon')::text, true);
  SELECT count(*) INTO n FROM public.interview_rounds;
  INSERT INTO _deny_results VALUES ('ANON total visible (must be 0)', n, 0);

  -- restore privileged role to evaluate results / clean up
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ----------------------------------------------------------------
  -- EVALUATE — any row whose got <> expected fails the whole suite.
  -- ----------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM _deny_results WHERE got IS DISTINCT FROM expected) THEN
    RAISE EXCEPTION 'interview_rounds RLS deny-suite FAILED: %',
      (SELECT string_agg(format('[%s got=%s want=%s]', label, got, expected), ' ')
         FROM _deny_results WHERE got IS DISTINCT FROM expected);
  END IF;

  RAISE NOTICE '----------------------------------------------------------------';
  RAISE NOTICE 'ALL INTERVIEW_ROUNDS RLS DENY ASSERTIONS PASSED';
  RAISE NOTICE '  (a) each user sees only their own round';
  RAISE NOTICE '  (b) cross-tenant SELECT denied for HM and talent both ways';
  RAISE NOTICE '  (c) anon sees none';
  RAISE NOTICE '  + trigger populates denorm ids + no denorm drift';
  RAISE NOTICE '----------------------------------------------------------------';

  -- Roll everything back: leave the shadow DB clean.
  RAISE EXCEPTION 'ROLLBACK_OK: deny-suite passed, intentionally rolling back fixture'
    USING ERRCODE = 'P0001';
END $$;

-- NOTE on the final RAISE: the suite deliberately aborts the DO block with a
-- sentinel exception AFTER all assertions pass, so the fixture rows never
-- persist. If you see:
--     ERROR:  ROLLBACK_OK: deny-suite passed, intentionally rolling back fixture
-- that is SUCCESS — every assertion passed and the data was discarded.
-- A FAILURE instead raises "interview_rounds RLS deny-suite FAILED: ..." listing
-- the offending assertions. Treat ONLY "ROLLBACK_OK" as green.
