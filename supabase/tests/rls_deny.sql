-- ============================================================================
-- BoLe Platform — RLS deny/allow invariant suite
--
-- WHY THIS FILE EXISTS
--   AUDIT finding D5: the authz layer is heavy and reactive (0014 helpers →
--   reverted → 0093 re-fix; 0091/0092 lock ic_path → 0103 undoes → 0105
--   restores; 0138 auth.uid wrap sweep). Twice in prod this churn re-exposed
--   talents.ic_path and once broke storage via RLS recursion. None of the 229
--   policies has an automated test. This script pins the highest-value
--   invariants so a future migration that regresses one of them fails CI.
--
-- HOW IT RUNS (wired into the `db-apply` job in .github/workflows/ci.yml)
--   1. `supabase db reset`            -- fresh local DB, replays ALL migrations
--   2. `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_deny.sql`
--   psql exits non-zero on the FIRST failing assertion (each assertion RAISEs
--   EXCEPTION), so the job is red the moment any invariant breaks.
--
-- NO pgTAP DEPENDENCY
--   pgTAP is not installed by any migration in this repo, so this suite uses
--   plain PL/pgSQL "do $$ ... raise exception on failure $$" blocks. Each block
--   prints a NOTICE on pass and RAISEs on fail.
--
-- SELF-CONTAINED + LEAVES NO RESIDUE
--   The whole script runs inside a single transaction and ROLLBACKs at the end,
--   so it seeds its own fixtures (two talents, an HM, a role, a match) and
--   never mutates the reset DB. It is therefore safe to run repeatedly. It must
--   be executed by a superuser / the migration owner (the CI psql connection),
--   which is how it can INSERT into auth.users and impersonate roles.
--
-- IMPERSONATION MODEL (mirrors supabase/diagnostics/f8_talents_rls_probe.sql)
--   Each block does `set local role authenticated;` and sets the JWT GUCs that
--   this project's auth.uid()/auth.role() read:
--     set local "request.jwt.claim.sub" to '<uuid>';   -- legacy form used by 0014/0138 policies
--     set local "request.jwt.claims"    to '{"sub":"<uuid>","role":"authenticated"}';
--   `reset role` restores the superuser between blocks.
--
-- BaZi secrecy: this file is internal CI tooling — no user-visible text. The
-- proprietary terms appear only as the real DB identifiers under test.
-- ============================================================================

begin;

-- Quieten the per-statement chatter; keep our NOTICE pass-lines visible.
set local client_min_messages = notice;

-- ----------------------------------------------------------------------------
-- Fixtures — fixed UUIDs so the assertions can reference rows directly.
--   alice = talent A (the "victim" whose private data must stay private)
--   bob   = talent B (an authenticated NON-owner / attacker)
--   carol = hiring_manager with NO match to alice (cannot discover her)
-- profiles are auto-created by the handle_new_user() trigger on auth.users
-- insert (0001_schema.sql), so we insert auth.users then UPDATE the profile.
-- ----------------------------------------------------------------------------

-- auth.users → triggers profile creation. Mirror seed_dnj_testers.sql columns.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'authenticated','authenticated','rls.alice@dnj-test.my',
   crypt('TestDNJ#2026', gen_salt('bf')), now(), now(), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"RLS Alice","role":"talent"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'authenticated','authenticated','rls.bob@dnj-test.my',
   crypt('TestDNJ#2026', gen_salt('bf')), now(), now(), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"RLS Bob","role":"talent"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'authenticated','authenticated','rls.carol.hr@dnj-test.my',
   crypt('TestDNJ#2026', gen_salt('bf')), now(), now(), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"RLS Carol","role":"hiring_manager"}'::jsonb);

-- Make sure the trigger-created profile rows carry the roles we need.
update public.profiles set role = 'talent'
  where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
               'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
update public.profiles set role = 'hiring_manager'
  where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Talent rows (note ic_path — the field that has twice been re-exposed).
insert into public.talents (id, profile_id, ic_path, resume_path)
values
  ('a1110000-0000-0000-0000-000000000001',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'ic/alice-secret-ic.pdf', 'resume/alice.pdf'),
  ('b1110000-0000-0000-0000-000000000002',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'ic/bob-secret-ic.pdf',   'resume/bob.pdf');

-- A company + HM (carol) with a role, but NO match to alice → carol must not
-- be able to discover alice via the hm-via-match policy.
insert into public.companies (id, name, registration_number, primary_hr_email, created_by)
values ('c0110000-0000-0000-0000-000000000003',
        'RLS Test Co', 'RLS-REG-0001', 'rls.carol.hr@dnj-test.my',
        'cccccccc-cccc-cccc-cccc-cccccccccccc');

insert into public.hiring_managers (id, profile_id, company_id, job_title)
values ('c1110000-0000-0000-0000-000000000004',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'c0110000-0000-0000-0000-000000000003', 'Hiring Lead');

insert into public.roles (id, hiring_manager_id, title)
values ('c2110000-0000-0000-0000-000000000005',
        'c1110000-0000-0000-0000-000000000004', 'Test Role');

-- Alice's match for HER OWN role-less scenario: a match owned by alice that
-- carries internal_reasoning. We attach it to carol's role so the row exists,
-- but the talent side is alice. Bob (a non-owner talent) must not see it.
insert into public.matches (id, role_id, talent_id, internal_reasoning, status)
values ('d3110000-0000-0000-0000-000000000006',
        'c2110000-0000-0000-0000-000000000005',
        'a1110000-0000-0000-0000-000000000001',
        '{"secret":"alice-only-reasoning"}'::jsonb,
        'generated');

-- ============================================================================
-- INVARIANT 1 — A non-owner authenticated talent (bob) CANNOT SELECT
--               talents.ic_path of another talent's row (alice).
--   Regression target: 0091/0092 lock → 0103 undo → 0105 restore churn.
-- ============================================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  set local "request.jwt.claims" to
    '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

  select count(*) into visible_count
  from public.talents
  where id = 'a1110000-0000-0000-0000-000000000001'
    and ic_path is not null;

  reset role;

  if visible_count <> 0 then
    raise exception
      'INVARIANT 1 FAILED: non-owner talent can SELECT another talent''s ic_path row (got % rows)',
      visible_count;
  end if;
  raise notice 'PASS 1: non-owner cannot read another talent''s ic_path';
end;
$$;

-- ============================================================================
-- INVARIANT 2 — A non-owner authenticated talent (bob) CANNOT SELECT another
--               user's match / internal_reasoning (alice's match).
--   matches RLS hides the whole row, so internal_reasoning is unreachable.
-- ============================================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  set local "request.jwt.claims" to
    '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

  select count(*) into visible_count
  from public.matches
  where id = 'd3110000-0000-0000-0000-000000000006';

  reset role;

  if visible_count <> 0 then
    raise exception
      'INVARIANT 2 FAILED: non-owner can SELECT another user''s match/internal_reasoning (got % rows)',
      visible_count;
  end if;
  raise notice 'PASS 2: non-owner cannot read another user''s match/internal_reasoning';
end;
$$;

-- ============================================================================
-- INVARIANT 2b (allow side) — the OWNER (alice) CAN see her own match.
--   Proves the deny in #2 is genuine RLS scoping, not a blanket table lock.
-- ============================================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  set local "request.jwt.claims" to
    '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

  select count(*) into visible_count
  from public.matches
  where id = 'd3110000-0000-0000-0000-000000000006';

  reset role;

  if visible_count <> 1 then
    raise exception
      'INVARIANT 2b FAILED: owner cannot SELECT her own match (expected 1, got %)',
      visible_count;
  end if;
  raise notice 'PASS 2b: owner can read her own match (deny in #2 is real scoping)';
end;
$$;

-- ============================================================================
-- INVARIANT 3 — decrypt_dob and compute_life_chart_score are NOT executable
--               by role `authenticated`.
--   • decrypt_dob: grant revoked in 0068_bazi_security_hardening.sql.
--   • compute_life_chart_score: dropped in 0149 (dead stub w/ stale grant) →
--     it must not exist for `authenticated` to execute. We assert the function
--     is gone; if a future migration re-adds it, this catches a missing revoke.
-- ============================================================================
do $$
declare
  can_decrypt boolean;
  lcs_oid oid;
begin
  -- decrypt_dob(bytea) exists but authenticated must NOT have EXECUTE.
  can_decrypt := has_function_privilege(
    'authenticated', 'public.decrypt_dob(bytea)', 'EXECUTE');
  if can_decrypt then
    raise exception
      'INVARIANT 3 FAILED: role authenticated CAN execute public.decrypt_dob(bytea)';
  end if;
  raise notice 'PASS 3a: authenticated cannot execute decrypt_dob';

  -- compute_life_chart_score(date,date) must be dropped (0149). If it ever
  -- reappears, it must not carry an authenticated EXECUTE grant.
  select p.oid into lcs_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'compute_life_chart_score'
    and pg_get_function_identity_arguments(p.oid) = 'date, date';

  if lcs_oid is not null then
    if has_function_privilege(
         'authenticated', lcs_oid, 'EXECUTE') then
      raise exception
        'INVARIANT 3 FAILED: compute_life_chart_score(date,date) is executable by authenticated';
    end if;
  end if;
  raise notice 'PASS 3b: compute_life_chart_score not executable by authenticated (dropped/ungranted)';
end;
$$;

-- ============================================================================
-- INVARIANT 4 — A talent (bob) CANNOT UPDATE another talent's profile (alice).
--   talents_update_self USING/ WITH CHECK is profile_id = auth.uid().
--   The UPDATE must affect ZERO rows (USING filters alice's row out).
-- ============================================================================
do $$
declare
  affected int;
  preserved text;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  set local "request.jwt.claims" to
    '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

  update public.talents
     set resume_path = 'resume/hijacked-by-bob.pdf'
   where id = 'a1110000-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;

  reset role;

  if affected <> 0 then
    raise exception
      'INVARIANT 4 FAILED: talent updated another talent''s profile (% rows affected)',
      affected;
  end if;

  -- Confirm alice's data is untouched (defence in depth).
  select resume_path into preserved
  from public.talents
  where id = 'a1110000-0000-0000-0000-000000000001';
  if preserved <> 'resume/alice.pdf' then
    raise exception
      'INVARIANT 4 FAILED: alice''s resume_path was mutated to %', preserved;
  end if;
  raise notice 'PASS 4: talent cannot update another talent''s profile';
end;
$$;

-- ============================================================================
-- INVARIANT 5 — industry_synonyms is NOT writable by a normal authenticated
--               user (RLS enabled + admin-only write in 0148).
--   0119 grants table privileges to authenticated, so the INSERT passes the
--   GRANT check but must be blocked by the RLS WITH CHECK (is_admin()).
-- ============================================================================
do $$
declare
  blocked boolean := false;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  set local "request.jwt.claims" to
    '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

  begin
    insert into public.industry_synonyms (alias, canonical)
    values ('rls-attacker-alias', 'finance');
  exception
    when insufficient_privilege then
      -- raised as: new row violates row-level security policy
      blocked := true;
  end;

  reset role;

  if not blocked then
    raise exception
      'INVARIANT 5 FAILED: authenticated user inserted into industry_synonyms (RLS not enforcing admin-only write)';
  end if;
  raise notice 'PASS 5: industry_synonyms is not writable by a normal authenticated user';
end;
$$;

-- ============================================================================
-- INVARIANT 6 — Cross-table RLS does NOT recurse (matches ↔ roles ↔ talents).
--   Regression target: the "infinite recursion detected in policy" incident
--   fixed in 0014 via SECURITY DEFINER helpers. If a future edit reintroduces
--   an inline cross-table EXISTS, this SELECT raises 42P17 and fails CI.
-- ============================================================================
do $$
declare
  dummy int;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" to 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  set local "request.jwt.claims" to
    '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

  -- Touching matches (joins roles), roles (joins matches), and talents
  -- (joins matches) exercises the cross-table policies that once recursed.
  select count(*) into dummy from public.matches;
  select count(*) into dummy from public.roles;
  select count(*) into dummy from public.talents;

  reset role;
  raise notice 'PASS 6: matches/roles/talents RLS evaluates without recursion';
exception
  when others then
    reset role;
    if sqlstate = '42P17' then
      raise exception 'INVARIANT 6 FAILED: RLS recursion detected (sqlstate 42P17): %', sqlerrm;
    end if;
    raise;  -- re-raise any other unexpected error
end;
$$;

-- ============================================================================
-- INVARIANT 7 — A non-matched hiring_manager (carol) CANNOT discover alice
--               via the hm-via-match talent visibility policy.
--   carol has a role but NO match to alice, so hm_can_see_talent() is false.
-- ============================================================================
do $$
declare
  visible_count int;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" to 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  set local "request.jwt.claims" to
    '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

  select count(*) into visible_count
  from public.talents
  where id = 'a1110000-0000-0000-0000-000000000001';

  reset role;

  if visible_count <> 0 then
    raise exception
      'INVARIANT 7 FAILED: unmatched HM can SELECT a talent row (got % rows)',
      visible_count;
  end if;
  raise notice 'PASS 7: unmatched hiring_manager cannot discover an unrelated talent';
end;
$$;

-- ============================================================================
-- INVARIANT 8 — A talent (bob) CANNOT self-promote to admin via profiles
--               UPDATE (profiles_update_self WITH CHECK restricts role).
--   Regression target: 0069_prevent_role_self_promotion.
-- ============================================================================
do $$
declare
  escalated boolean := false;
  final_role text;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" to 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  set local "request.jwt.claims" to
    '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

  begin
    update public.profiles
       set role = 'admin'
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    -- If the WITH CHECK rejects it, we get insufficient_privilege; if it
    -- silently affects 0 rows that's also a non-escalation. Either is a pass.
  exception
    when insufficient_privilege then
      escalated := false;
  end;

  reset role;

  select role into final_role
  from public.profiles
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if final_role = 'admin' then
    escalated := true;
  end if;

  if escalated then
    raise exception
      'INVARIANT 8 FAILED: talent self-promoted to admin (role is now %)', final_role;
  end if;
  raise notice 'PASS 8: talent cannot self-promote to admin via profiles UPDATE';
end;
$$;

-- ============================================================================
-- All assertions passed if we reach here. ROLLBACK so the suite is a pure
-- read-only smoke against the reset DB and re-runnable without cleanup.
-- ============================================================================
do $$ begin raise notice 'RLS DENY SUITE: all invariants passed.'; end; $$;

rollback;
