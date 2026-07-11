-- ============================================================================
-- BoLe / Restaurant OS — anon orders deny test  (proves 0183)
--
-- WHY: 0183_restaurant_anon_orders_lockdown.sql removed the unfiltered anon
--   SELECT on restaurant.orders / restaurant.order_item (H3 cross-tenant PII
--   leak) and revoked the anon table SELECT grants, while preserving guest
--   order tracking via restaurant.get_order_tracking(uuid). This suite pins
--   those invariants so a future migration that re-opens the leak fails CI.
--
-- HARNESS: follows supabase/tests/rls_deny.sql exactly — pgTAP is NOT installed
--   in this repo, so assertions are plain PL/pgSQL `do $$ ... raise exception on
--   failure $$` blocks. Run it the same way rls_deny.sql is run:
--       psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/restaurant_anon_orders_deny.sql
--   (against a DB where all migrations have replayed, e.g. `supabase db reset`).
--   Each block prints a NOTICE on pass and RAISEs on fail; the whole script runs
--   in one transaction and ROLLBACKs, leaving no residue. Requires the migration
--   owner / superuser connection so it can `set local role anon`.
--
--   NOTE: relies on the Supabase-provided `anon` role existing. On a fresh local
--   `supabase db reset` it does. On a bare Postgres without Supabase roles, this
--   test needs `supabase test db` (or a manual `create role anon nologin`).
-- ============================================================================

begin;

set local client_min_messages = notice;

-- ----------------------------------------------------------------------------
-- INVARIANT A — anon CANNOT SELECT restaurant.orders (grant revoked in 0183).
--   Expect a permission-denied (insufficient_privilege / 42501) the moment the
--   query is planned against the table, since the anon SELECT grant is gone and
--   the unfiltered anon read policy was dropped.
-- ----------------------------------------------------------------------------
do $$
declare
  blocked boolean := false;
  dummy   int;
begin
  set local role anon;
  set local "request.jwt.claims" to '{"role":"anon"}';

  begin
    select count(*) into dummy from restaurant.orders;
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  reset role;

  if not blocked then
    raise exception
      'INVARIANT A FAILED: anon can SELECT restaurant.orders (H3 cross-tenant PII leak re-opened)';
  end if;
  raise notice 'PASS A: anon cannot SELECT restaurant.orders';
end;
$$;

-- ----------------------------------------------------------------------------
-- INVARIANT B — anon CANNOT SELECT restaurant.order_item (grant revoked in 0183).
-- ----------------------------------------------------------------------------
do $$
declare
  blocked boolean := false;
  dummy   int;
begin
  set local role anon;
  set local "request.jwt.claims" to '{"role":"anon"}';

  begin
    select count(*) into dummy from restaurant.order_item;
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  reset role;

  if not blocked then
    raise exception
      'INVARIANT B FAILED: anon can SELECT restaurant.order_item (H3 leak re-opened)';
  end if;
  raise notice 'PASS B: anon cannot SELECT restaurant.order_item';
end;
$$;

-- ----------------------------------------------------------------------------
-- INVARIANT C — guest order tracking is PRESERVED: anon CAN EXECUTE
--   restaurant.get_order_tracking(uuid). A random id returns zero rows (no
--   exception); the point is that EXECUTE is granted (no insufficient_privilege).
--   This proves the H3 lockdown did not break the public QR tracking flow.
-- ----------------------------------------------------------------------------
do $$
declare
  denied boolean := false;
  dummy  int;
begin
  set local role anon;
  set local "request.jwt.claims" to '{"role":"anon"}';

  begin
    select count(*) into dummy
    from restaurant.get_order_tracking('00000000-0000-0000-0000-000000000000'::uuid);
  exception
    when insufficient_privilege then
      denied := true;
  end;

  reset role;

  if denied then
    raise exception
      'INVARIANT C FAILED: anon cannot EXECUTE restaurant.get_order_tracking (guest tracking broken)';
  end if;
  raise notice 'PASS C: anon can still EXECUTE restaurant.get_order_tracking (tracking preserved)';
end;
$$;

rollback;
