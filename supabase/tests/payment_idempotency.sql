-- ============================================================================
-- BoLe Platform — payment exactly-once (idempotency) money-path test
--
-- WHY THIS FILE EXISTS
--   The payment-webhook money path (supabase/functions/payment-webhook/index.ts)
--   guards against double-credit with TWO server-side primitives:
--     1. A conditional flip:  UPDATE ... SET payment_status='paid'
--                             WHERE id=X AND payment_status='pending' RETURNING id
--        — a replayed webhook for an already-paid purchase flips 0 rows and the
--        handler exits "already paid" BEFORE granting anything.
--     2. award_points(..., p_idempotency_key='point_purchase:<id>') — the
--        ux_point_tx_idempotency unique index makes a replayed credit a no-op.
--   payment-webhook.test.ts proves the SIGNATURE algorithm but explicitly defers
--   the DB-side "credit exactly once" proof to an integration harness (see its
--   header). This file IS that harness, implemented as a no-network psql test:
--   it runs the handler SUCCESS path TWICE against seeded pending rows and asserts
--   the second run grants nothing.
--
-- HOW IT RUNS (wired into the `db-apply` job in .github/workflows/ci.yml, next to
--   column_isolation.sql / rls_deny.sql, after `supabase db reset`):
--     psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/payment_idempotency.sql
--   Each assertion RAISEs EXCEPTION on failure, so ON_ERROR_STOP exits psql
--   non-zero on the FIRST broken invariant and CI goes red.
--
-- NO pgTAP DEPENDENCY — plain PL/pgSQL "do $$ ... raise on failure $$" blocks,
--   mirroring rls_deny.sql / column_isolation.sql.
--
-- SELF-CONTAINED + LEAVES NO RESIDUE
--   The whole script runs in ONE transaction and ROLLBACKs at the end, so it
--   seeds its own fixtures (a buyer profile, a company/HM/role, one
--   extra_match_purchase, one point_purchase) and never mutates the reset DB.
--   It runs as the migration owner / superuser (the CI psql connection) and uses
--   the service-role view of the data: the real webhook talks to the DB via
--   adminClient() (service_role, RLS-bypassing), so this test deliberately does
--   NOT impersonate `authenticated` — it exercises the exactly-once LOGIC, which
--   is what the audit flagged, not the RLS layer (covered by rls_deny.sql).
--
-- WHAT IT ASSERTS (the exactly-once money guard, both purchase kinds):
--   A) extra_match_purchases (hm_extra):
--      - 1st conditional flip affects exactly 1 row; 2nd affects 0.
--      - increment_extra_matches_used runs ONCE (gated on the flip) → roles
--        .extra_matches_used advances by quantity exactly once (not twice).
--   B) point_purchases:
--      - 1st conditional flip affects exactly 1 row; 2nd affects 0.
--      - award_points(p_idempotency_key='point_purchase:<id>') called on BOTH
--        deliveries leaves EXACTLY ONE credit row in the point_transactions
--        ledger for that key (the 2nd is the idempotent no-op).
--
-- BaZi secrecy: internal CI tooling — no user-visible text.
-- ============================================================================

begin;

-- Quieten per-statement chatter; keep our NOTICE pass-lines visible.
set local client_min_messages = notice;

-- ----------------------------------------------------------------------------
-- Fixtures — fixed (hex-only) UUIDs so assertions reference rows directly.
--   pat (aa…)  = the buyer (a profile; both purchases belong to him) and also
--                the HM who owns the role behind the hm_extra purchase.
-- profiles are auto-created by handle_new_user() on auth.users insert
-- (0001_schema.sql), so we insert auth.users then UPDATE the profile role.
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000',
   'aa110000-0000-0000-0000-0000000000aa',
   'authenticated','authenticated','pay.pat.hr@dnj-test.my',
   crypt('TestDNJ#2026', gen_salt('bf')), now(), now(), now(),
   '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Pay Pat","role":"hiring_manager"}'::jsonb);
update public.profiles set role = 'hiring_manager'
  where id = 'aa110000-0000-0000-0000-0000000000aa';

-- A company + HM (pat) + role. The hm_extra purchase targets this role, and the
-- quota counter we assert on is public.roles.extra_matches_used for this role.
insert into public.companies (id, name, registration_number, primary_hr_email, created_by)
values ('cc110000-0000-0000-0000-0000000000cc',
        'Pay Test Co', 'PAY-REG-0001', 'pay.pat.hr@dnj-test.my',
        'aa110000-0000-0000-0000-0000000000aa');

insert into public.hiring_managers (id, profile_id, company_id, job_title)
values ('bb110000-0000-0000-0000-0000000000bb',
        'aa110000-0000-0000-0000-0000000000aa',
        'cc110000-0000-0000-0000-0000000000cc', 'Pay Lead');

insert into public.roles (id, hiring_manager_id, title)
values ('dd110000-0000-0000-0000-0000000000dd',
        'bb110000-0000-0000-0000-0000000000bb', 'Pay Role');

-- One PENDING extra_match_purchase (hm_extra → role_id required by the
-- emp_target_matches_type constraint). quantity=1, within the 0..3 cap.
insert into public.extra_match_purchases
  (id, user_id, role_id, match_type, quantity, payment_status)
values
  ('ee110000-0000-0000-0000-0000000000ee',
   'aa110000-0000-0000-0000-0000000000aa',
   'dd110000-0000-0000-0000-0000000000dd',
   'hm_extra', 1, 'pending');

-- One PENDING point_purchase (Diamond Points package buy).
insert into public.point_purchases
  (id, user_id, package_id, package_name, amount_rm, points, payment_status)
values
  ('ff110000-0000-0000-0000-0000000000ff',
   'aa110000-0000-0000-0000-0000000000aa',
   'starter', 'Starter', 39.00, 169, 'pending');

-- ============================================================================
-- PART A — extra_match_purchases: conditional flip + quota increment exactly once
--
-- Mirrors index.ts SUCCESS path lines ~132-155:
--   UPDATE extra_match_purchases SET payment_status='paid'
--     WHERE id=X AND payment_status='pending' RETURNING id
--   if flipped rows == 0 → exit "already paid" (skip the increment)
--   else increment_extra_matches_used('roles', role_id, quantity)
-- We run that block TWICE (two webhook deliveries) and assert exactly-once.
-- ============================================================================
do $$
declare
  flip1 int;
  flip2 int;
  used_after int;
begin
  -- Baseline: a freshly-seeded role starts at extra_matches_used = 0.
  -- ── Delivery #1 (genuine payment) ──────────────────────────────────────
  with f as (
    update public.extra_match_purchases
       set payment_status = 'paid', paid_at = now()
     where id = 'ee110000-0000-0000-0000-0000000000ee'
       and payment_status = 'pending'
    returning id, role_id, quantity
  )
  select count(*) into flip1 from f;

  if flip1 = 1 then
    -- The handler only increments when the flip affected a row.
    perform public.increment_extra_matches_used('roles',
              'dd110000-0000-0000-0000-0000000000dd', 1);
  end if;

  -- ── Delivery #2 (replay of the SAME webhook) ───────────────────────────
  with f as (
    update public.extra_match_purchases
       set payment_status = 'paid', paid_at = now()
     where id = 'ee110000-0000-0000-0000-0000000000ee'
       and payment_status = 'pending'
    returning id, role_id, quantity
  )
  select count(*) into flip2 from f;

  if flip2 = 1 then
    perform public.increment_extra_matches_used('roles',
              'dd110000-0000-0000-0000-0000000000dd', 1);
  end if;

  -- ── Assertions ─────────────────────────────────────────────────────────
  if flip1 <> 1 then
    raise exception
      'PART A FAILED: first conditional flip affected % rows (expected exactly 1)', flip1;
  end if;
  if flip2 <> 0 then
    raise exception
      'PART A FAILED: replay flip affected % rows (expected 0 — pending guard let a double-grant through)', flip2;
  end if;

  select extra_matches_used into used_after
    from public.roles where id = 'dd110000-0000-0000-0000-0000000000dd';
  if used_after <> 1 then
    raise exception
      'PART A FAILED: roles.extra_matches_used = % after two deliveries (expected 1 — quota incremented more than once)', used_after;
  end if;

  raise notice 'PASS A: extra_match flip 1→0 across replay; quota incremented exactly once (used=%)', used_after;
end;
$$;

-- ============================================================================
-- PART B — point_purchases: conditional flip + award_points idempotency
--
-- Mirrors index.ts tryPointPurchase SUCCESS path lines ~256-271:
--   UPDATE point_purchases SET payment_status='paid'
--     WHERE id=X AND payment_status='pending' RETURNING id
--   if flipped rows == 0 → return (skip the award)
--   else award_points(user, points, ..., p_idempotency_key='point_purchase:<id>')
-- award_points itself is also idempotent (ux_point_tx_idempotency), so even if
-- BOTH deliveries reached it the ledger would carry exactly one credit. We call
-- it on BOTH deliveries (belt-and-braces) and assert ONE ledger row for the key.
-- ============================================================================
do $$
declare
  flip1 int;
  flip2 int;
  award1 int;
  award2 int;
  ledger_rows int;
  ledger_delta int;
  v_key text := 'point_purchase:ff110000-0000-0000-0000-0000000000ff';
  v_user uuid := 'aa110000-0000-0000-0000-0000000000aa';
begin
  -- ── Delivery #1 (genuine payment) ──────────────────────────────────────
  with f as (
    update public.point_purchases
       set payment_status = 'paid', paid_at = now()
     where id = 'ff110000-0000-0000-0000-0000000000ff'
       and payment_status = 'pending'
    returning id
  )
  select count(*) into flip1 from f;

  -- Call award_points on BOTH deliveries with the SAME idempotency key, exactly
  -- as the handler does (it does not gate the award on the flip — the key is the
  -- guard). award_points returns the awarded delta (169) the first time, 0 after.
  award1 := public.award_points(
              v_user, 169, 'extra_match_purchased',
              jsonb_build_object('purchase_id', 'ff110000-0000-0000-0000-0000000000ff'),
              v_key);

  -- ── Delivery #2 (replay of the SAME webhook) ───────────────────────────
  with f as (
    update public.point_purchases
       set payment_status = 'paid', paid_at = now()
     where id = 'ff110000-0000-0000-0000-0000000000ff'
       and payment_status = 'pending'
    returning id
  )
  select count(*) into flip2 from f;

  award2 := public.award_points(
              v_user, 169, 'extra_match_purchased',
              jsonb_build_object('purchase_id', 'ff110000-0000-0000-0000-0000000000ff'),
              v_key);

  -- ── Assertions ─────────────────────────────────────────────────────────
  if flip1 <> 1 then
    raise exception
      'PART B FAILED: first point_purchase flip affected % rows (expected exactly 1)', flip1;
  end if;
  if flip2 <> 0 then
    raise exception
      'PART B FAILED: replay point_purchase flip affected % rows (expected 0)', flip2;
  end if;
  if award1 <> 169 then
    raise exception
      'PART B FAILED: first award_points returned % (expected 169 = points credited)', award1;
  end if;
  if award2 <> 0 then
    raise exception
      'PART B FAILED: replay award_points returned % (expected 0 — idempotency key did not block the double credit)', award2;
  end if;

  -- The ledger must hold EXACTLY ONE credit row for this idempotency key.
  select count(*), coalesce(sum(delta), 0)
    into ledger_rows, ledger_delta
    from public.point_transactions
   where user_id = v_user
     and idempotency_key = v_key;

  if ledger_rows <> 1 then
    raise exception
      'PART B FAILED: point_transactions has % rows for key % (expected exactly 1 credit)', ledger_rows, v_key;
  end if;
  if ledger_delta <> 169 then
    raise exception
      'PART B FAILED: ledger credit total for key % is % (expected 169)', v_key, ledger_delta;
  end if;

  raise notice 'PASS B: point_purchase flip 1→0 across replay; ledger has exactly 1 credit (delta=%) for key %', ledger_delta, v_key;
end;
$$;

-- ============================================================================
-- All assertions passed if we reach here. ROLLBACK so this suite is a pure,
-- re-runnable smoke against the reset DB and leaves no fixtures behind.
-- ============================================================================
do $$ begin raise notice 'PAYMENT IDEMPOTENCY SUITE: all invariants passed (exactly-once money guard intact).'; end; $$;

rollback;
