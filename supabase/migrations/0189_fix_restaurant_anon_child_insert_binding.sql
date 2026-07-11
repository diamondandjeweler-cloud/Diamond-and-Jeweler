-- =============================================================================
-- 0186 — restaurant anon child-insert binding  (M1 residual)  (2026-07-11)
-- =============================================================================
-- WHAT WAS WRONG
--   0043_guest_menu_rls.sql opened the public QR guest-ordering flow with three
--   anon INSERT policies whose WITH CHECK was only `auth.role() = 'anon'`, i.e.
--   NO binding of the new row to a coherent parent order/branch:
--       rst_anon_insert_orders          (on restaurant.orders)
--       rst_anon_insert_order_item      (on restaurant.order_item)
--       rst_anon_insert_kitchen_ticket  (on restaurant.kitchen_ticket)
--
--   0183_restaurant_anon_orders_lockdown.sql already tightened the PARENT policy
--   (rst_anon_insert_orders now requires a table_id that belongs to the order's
--   branch). But it left the two CHILD-row policies unbound. Confirmed against
--   prod (project sfnrpbsdscikpmbhrzub) on 2026-07-11:
--       rst_anon_insert_order_item      with_check = ((select auth.role()) = 'anon')
--       rst_anon_insert_kitchen_ticket  with_check = ((select auth.role()) = 'anon')
--   So any anonymous caller can INSERT order_item / kitchen_ticket rows carrying
--   an arbitrary order_id (and, for tickets, an arbitrary branch_id / order_item_id)
--   that do NOT correspond to any real order — injecting bogus line items and
--   kitchen tickets, cross-linking a ticket to a different branch, or attaching
--   line items to another tenant's order id.
--
-- THE EXACT FIX
--   Bind each child INSERT to a valid parent, WITHOUT widening any read surface:
--     * order_item.order_id must reference a real restaurant.orders row.
--     * kitchen_ticket.order_id must reference a real order whose branch_id equals
--       the ticket's branch_id, and (when present) order_item_id must belong to
--       that same order.
--
--   WHY THE CHECK IS DONE VIA SECURITY DEFINER HELPERS (not a plain EXISTS):
--   0183 REVOKED anon SELECT on restaurant.orders / order_item; on prod anon holds
--   only INSERT column-grants there. A WITH CHECK that referenced those tables
--   directly (EXISTS (select 1 from restaurant.orders ...)) would be evaluated as
--   the anon role and raise "permission denied for table orders", breaking the
--   very guest INSERT it guards. Two STABLE SECURITY DEFINER helpers run as the
--   function owner (bypassing the missing anon grants + RLS) and return only a
--   boolean — no PII, no row data. This mirrors the get_order_tracking() pattern
--   already established in 0183.
--
-- WHY IT IS SAFE (does NOT break the legitimate QR guest-order flow, 0043)
--   placeGuestOrder() (apps/web/src/lib/restaurant/data/orders.ts) inserts the
--   order first, then the order_items with order_id = the new order id, then the
--   kitchen_tickets with the SAME branch_id as the order and order_item_id = each
--   freshly-inserted item id — each as a separate committed PostgREST request.
--   By the time a child insert runs, its parent rows are committed and visible to
--   the definer helper, so the new WITH CHECK evaluates TRUE. Pure structural
--   integrity checks; no dependence on branch status or app-flow context.
--   Authenticated staff are unaffected: these anon policies require
--   auth.role() = 'anon' and staff inserts pass via their own permissive policy.
--
-- IDEMPOTENT / TRANSACTIONAL: create-or-replace functions + drop-policy-if-exists
-- + re-create. Re-applying is a no-op. Wrapped in begin/commit.
--
-- ROLLBACK (revert to pre-0186 unbound child policies):
--   begin;
--   drop policy if exists rst_anon_insert_order_item on restaurant.order_item;
--   create policy rst_anon_insert_order_item on restaurant.order_item
--     for insert with check ((select auth.role()) = 'anon');
--   drop policy if exists rst_anon_insert_kitchen_ticket on restaurant.kitchen_ticket;
--   create policy rst_anon_insert_kitchen_ticket on restaurant.kitchen_ticket
--     for insert with check ((select auth.role()) = 'anon');
--   drop function if exists restaurant.anon_kitchen_ticket_parent_ok(uuid, uuid, uuid);
--   drop function if exists restaurant.anon_order_exists(uuid);
--   commit;
-- =============================================================================

begin;

-- ── Helper 1: does a parent order exist? (order_item binding) ─────────────────
-- SECURITY DEFINER so the check does not require anon SELECT on restaurant.orders
-- (revoked by 0183). Returns only a boolean; UUIDs are unguessable capability
-- tokens, so this exposes no meaningful existence oracle. search_path pinned.
create or replace function restaurant.anon_order_exists(p_order_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = restaurant, public, pg_temp
as $$
  select exists (
    select 1 from restaurant.orders o
    where o.id = p_order_id
  )
$$;

revoke all     on function restaurant.anon_order_exists(uuid) from public;
grant  execute on function restaurant.anon_order_exists(uuid) to anon, authenticated;

comment on function restaurant.anon_order_exists(uuid) is
  'Guest QR-order integrity helper (0186, fixes M1): true iff a real '
  'restaurant.orders row exists for the id. SECURITY DEFINER so the anon '
  'order_item INSERT policy can bind order_id to a valid parent without anon '
  'needing SELECT on restaurant.orders (revoked in 0183). Returns no PII.';

-- ── Helper 2: valid parent for a kitchen ticket? (branch + optional item) ────
create or replace function restaurant.anon_kitchen_ticket_parent_ok(
    p_order_id       uuid,
    p_branch_id      uuid,
    p_order_item_id  uuid
  )
  returns boolean
  language sql
  security definer
  stable
  set search_path = restaurant, public, pg_temp
as $$
  select exists (
           select 1 from restaurant.orders o
           where o.id = p_order_id
             and o.branch_id = p_branch_id
         )
     and (
           p_order_item_id is null
           or exists (
             select 1 from restaurant.order_item oi
             where oi.id = p_order_item_id
               and oi.order_id = p_order_id
           )
         )
$$;

revoke all     on function restaurant.anon_kitchen_ticket_parent_ok(uuid, uuid, uuid) from public;
grant  execute on function restaurant.anon_kitchen_ticket_parent_ok(uuid, uuid, uuid) to anon, authenticated;

comment on function restaurant.anon_kitchen_ticket_parent_ok(uuid, uuid, uuid) is
  'Guest QR-order integrity helper (0186, fixes M1): true iff the ticket''s '
  'order_id is a real order at the ticket''s branch_id and (when set) its '
  'order_item_id belongs to that order. SECURITY DEFINER; returns no PII.';

-- ── M1: bind anon order_item INSERT to a real parent order ───────────────────
drop policy if exists rst_anon_insert_order_item on restaurant.order_item;
create policy rst_anon_insert_order_item on restaurant.order_item
  for insert
  with check (
    (select auth.role()) = 'anon'
    and restaurant.anon_order_exists(order_id)
  );

-- ── M1: bind anon kitchen_ticket INSERT to a real parent order + branch ──────
drop policy if exists rst_anon_insert_kitchen_ticket on restaurant.kitchen_ticket;
create policy rst_anon_insert_kitchen_ticket on restaurant.kitchen_ticket
  for insert
  with check (
    (select auth.role()) = 'anon'
    and restaurant.anon_kitchen_ticket_parent_ok(order_id, branch_id, order_item_id)
  );

commit;