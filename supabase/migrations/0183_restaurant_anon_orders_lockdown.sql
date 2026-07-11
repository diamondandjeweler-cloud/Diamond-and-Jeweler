-- =============================================================================
-- 0183 — restaurant anon orders lockdown  (H3 + M1)  (2026-07-11)
-- =============================================================================
-- 0043_guest_menu_rls.sql opened the public QR guest-ordering flow. Two of its
-- grants/policies are over-broad:
--
--   H3 (anon cross-tenant customer-PII read). Verified in 0043:
--       grant select on restaurant.orders     to anon;   -- line 11
--       grant select on restaurant.order_item to anon;   -- line 12
--       create policy rst_anon_read_orders     on restaurant.orders
--         for select using (auth.role() = 'anon');        -- lines 47-48  (NO row filter)
--       create policy rst_anon_read_order_item on restaurant.order_item
--         for select using (auth.role() = 'anon');        -- lines 50-51  (NO row filter)
--     restaurant.orders carries customer_name / customer_phone / delivery_address
--     (0019_restaurant_schema.sql:251-263). With an unfiltered anon SELECT policy
--     + table grant, ANY anonymous visitor can read EVERY customer's name, phone
--     and delivery address across EVERY tenant — a full cross-tenant PII leak.
--
--   M1 (anon branch-unbound insert). 0043:37-38 grants anon INSERT with only
--     `with check (auth.role() = 'anon')` — no binding to a coherent table/branch.
--
-- FIX
--   H3: drop the two unfiltered anon read policies and REVOKE the SELECT grants.
--       Guest ordering does not need to read the raw PII rows back — it only needs
--       lightweight status tracking for the one order it just placed. That is
--       preserved by a SECURITY DEFINER function restaurant.get_order_tracking(uuid)
--       which returns ONLY non-PII tracking columns for a single (unguessable) id.
--       Anon menu / branch / table reads and the guest INSERT paths are KEPT.
--
--   M1: tighten rst_anon_insert_orders so a supplied table_id must belong to the
--       same branch_id as the order (dine-in QR flow). table_id IS NULL is allowed
--       (takeaway / delivery / bar). This is a pure structural integrity check with
--       no dependence on branch status or app-flow context, so it cannot break any
--       legitimate guest order. Full cross-tenant / rate-limit binding and an
--       active-branch gate need live verification + a signed-QR token and are
--       logged as residual in docs/AUDIT_LOG.md (per AGENTS.md §4.4).
--
-- Idempotent: drop policy if exists / create or replace / revoke are all replayable.
-- Not applied to any DB by this file; checked in as source-of-truth. Deny coverage:
-- supabase/tests/restaurant_anon_orders_deny.sql.
--
-- ROLLBACK (if needed): re-run the 0043 fragments —
--   grant select on restaurant.orders, restaurant.order_item to anon;
--   create policy rst_anon_read_orders     on restaurant.orders     for select using (auth.role()='anon');
--   create policy rst_anon_read_order_item on restaurant.order_item for select using (auth.role()='anon');
--   drop function if exists restaurant.get_order_tracking(uuid);
-- =============================================================================

begin;

-- ── H3: remove the unfiltered anon read policies + table grants ──────────────
drop policy if exists rst_anon_read_orders     on restaurant.orders;
drop policy if exists rst_anon_read_order_item on restaurant.order_item;

revoke select on restaurant.orders     from anon;
revoke select on restaurant.order_item from anon;

-- ── Preserve guest order tracking (non-PII only) ─────────────────────────────
-- SECURITY DEFINER so it bypasses RLS to fetch the single row for the id the
-- guest already holds. Returns NO PII (no customer_name / customer_phone /
-- delivery_address / notes / membership). search_path pinned per L1 hygiene.
create or replace function restaurant.get_order_tracking(p_order_id uuid)
  returns table (
    id          uuid,
    status      text,
    order_type  text,
    total       numeric,
    pickup_time timestamptz,   -- staff-set ETA for takeaway/delivery (no `eta` column exists)
    created_at  timestamptz,
    updated_at  timestamptz
  )
  language sql
  security definer
  stable
  set search_path = restaurant, public, pg_temp
as $$
  select o.id, o.status, o.order_type, o.total, o.pickup_time, o.created_at, o.updated_at
  from restaurant.orders o
  where o.id = p_order_id
$$;

revoke all     on function restaurant.get_order_tracking(uuid) from public;
grant  execute on function restaurant.get_order_tracking(uuid) to anon, authenticated;

comment on function restaurant.get_order_tracking(uuid) is
  'Guest order-tracking for the public QR flow. Returns non-PII status fields '
  'for a single unguessable order id. Replaces the removed unfiltered anon '
  'SELECT on restaurant.orders/order_item (0183, fixes H3).';

-- ── M1: bind anon order insert to a coherent table/branch ────────────────────
drop policy if exists rst_anon_insert_orders on restaurant.orders;
create policy rst_anon_insert_orders on restaurant.orders
  for insert
  with check (
    auth.role() = 'anon'
    and (
      table_id is null
      or exists (
        select 1
        from restaurant.restaurant_table t
        where t.id = restaurant.orders.table_id
          and t.branch_id = restaurant.orders.branch_id
      )
    )
  );

commit;
