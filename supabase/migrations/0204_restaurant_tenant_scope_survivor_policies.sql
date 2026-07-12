-- =============================================================================
-- 0204 — restaurant cross-tenant CRUD via surviving unfiltered
--        rst_all_authenticated (HIGH, finding auth-rls-2)           (2026-07-13)
-- =============================================================================
-- 0047_restaurant_multitenancy step-7 drops rst_all_authenticated on every
-- restaurant table, then re-creates branch/org-scoped policies — but its
-- branch-scoped table list (0047:273-278) OMITS stock_take, stock_take_line,
-- waiter_section and promotion_redemption, and for notification the surviving
-- blanket policy OR-bypasses the scoped rst_org_notification_all (permissive
-- policies combine with OR). The live pg_policies sweep 0138 confirms an
-- unfiltered
--   rst_all_authenticated FOR ALL USING/WITH CHECK ((select auth.role())='authenticated')
-- is still active on all five tables (0138:306/331/338/342/346). Because the
-- restaurant schema is PostgREST-exposed (0020:10 grants authenticated all
-- privileges; 0043 anon menu grants) RLS is the only guard, so ANY authenticated
-- platform user can SELECT/UPDATE/DELETE every tenant's stock-take counts &
-- valuations, waiter sections, promotion redemptions and notifications
-- (cross-tenant read + competitor-inventory corruption + redemption/PII leak).
--
-- FIX: drop the surviving blanket policy on each table and add an org-scoped
-- FOR ALL policy following the established 0047 recipe. Scoping column varies:
--   * stock_take            — has branch_id            → direct branch scope
--   * stock_take_line       — has stock_take_id        → join stock_take.branch_id
--   * waiter_section        — has section_id (comp PK)  → join section.branch_id
--   * promotion_redemption  — has promotion_id         → join promotion.branch_id
--   * notification          — has branch_id; 0047 already created
--                             rst_org_notification_all → only DROP the blanket
--                             (scoped policy re-asserted here for idempotency).
-- restaurant.my_org_id() / is_platform_admin() are SECURITY DEFINER STABLE
-- helpers (0047:80-93); wrapped in (select …) so the planner evaluates them once
-- per statement (mirrors the 0138 perf fix).
--
-- Idempotent: `drop policy if exists` before every `create policy` (create policy
-- is not itself idempotent). Author-only — owner must apply. Deny coverage added
-- in supabase/tests/rls_deny.sql (INVARIANT 11).
--
-- ROLLBACK (restores the pre-0204 unfiltered blanket — NOT recommended, re-opens
-- the leak):
--   drop policy if exists rst_org_stock_take_all           on restaurant.stock_take;
--   drop policy if exists rst_org_stock_take_line_all       on restaurant.stock_take_line;
--   drop policy if exists rst_org_waiter_section_all        on restaurant.waiter_section;
--   drop policy if exists rst_org_promotion_redemption_all  on restaurant.promotion_redemption;
--   -- (rst_org_notification_all is 0047's policy; leave it in place)
--   create policy rst_all_authenticated on restaurant.stock_take          for all using ((select auth.role())='authenticated') with check ((select auth.role())='authenticated');
--   create policy rst_all_authenticated on restaurant.stock_take_line     for all using ((select auth.role())='authenticated') with check ((select auth.role())='authenticated');
--   create policy rst_all_authenticated on restaurant.waiter_section      for all using ((select auth.role())='authenticated') with check ((select auth.role())='authenticated');
--   create policy rst_all_authenticated on restaurant.promotion_redemption for all using ((select auth.role())='authenticated') with check ((select auth.role())='authenticated');
--   create policy rst_all_authenticated on restaurant.notification        for all using ((select auth.role())='authenticated') with check ((select auth.role())='authenticated');
-- =============================================================================

begin;

-- ── stock_take — direct branch_id scope ─────────────────────────────────────
drop policy if exists rst_all_authenticated    on restaurant.stock_take;
drop policy if exists rst_org_stock_take_all    on restaurant.stock_take;
create policy rst_org_stock_take_all on restaurant.stock_take
  for all
  using (
    branch_id in (
      select b.id from restaurant.branch b
      where b.organization_id = (select restaurant.my_org_id())
    )
    or (select restaurant.is_platform_admin())
  )
  with check (
    branch_id in (
      select b.id from restaurant.branch b
      where b.organization_id = (select restaurant.my_org_id())
    )
    or (select restaurant.is_platform_admin())
  );

-- ── stock_take_line — join through parent stock_take.branch_id ──────────────
drop policy if exists rst_all_authenticated        on restaurant.stock_take_line;
drop policy if exists rst_org_stock_take_line_all   on restaurant.stock_take_line;
create policy rst_org_stock_take_line_all on restaurant.stock_take_line
  for all
  using (
    stock_take_id in (
      select st.id from restaurant.stock_take st
      join restaurant.branch b on b.id = st.branch_id
      where b.organization_id = (select restaurant.my_org_id())
    )
    or (select restaurant.is_platform_admin())
  )
  with check (
    stock_take_id in (
      select st.id from restaurant.stock_take st
      join restaurant.branch b on b.id = st.branch_id
      where b.organization_id = (select restaurant.my_org_id())
    )
    or (select restaurant.is_platform_admin())
  );

-- ── waiter_section — join through section.branch_id (composite PK, no branch_id) ─
drop policy if exists rst_all_authenticated       on restaurant.waiter_section;
drop policy if exists rst_org_waiter_section_all   on restaurant.waiter_section;
create policy rst_org_waiter_section_all on restaurant.waiter_section
  for all
  using (
    section_id in (
      select s.id from restaurant.section s
      join restaurant.branch b on b.id = s.branch_id
      where b.organization_id = (select restaurant.my_org_id())
    )
    or (select restaurant.is_platform_admin())
  )
  with check (
    section_id in (
      select s.id from restaurant.section s
      join restaurant.branch b on b.id = s.branch_id
      where b.organization_id = (select restaurant.my_org_id())
    )
    or (select restaurant.is_platform_admin())
  );

-- ── promotion_redemption — join through promotion.branch_id ─────────────────
drop policy if exists rst_all_authenticated             on restaurant.promotion_redemption;
drop policy if exists rst_org_promotion_redemption_all   on restaurant.promotion_redemption;
create policy rst_org_promotion_redemption_all on restaurant.promotion_redemption
  for all
  using (
    promotion_id in (
      select p.id from restaurant.promotion p
      join restaurant.branch b on b.id = p.branch_id
      where b.organization_id = (select restaurant.my_org_id())
    )
    or (select restaurant.is_platform_admin())
  )
  with check (
    promotion_id in (
      select p.id from restaurant.promotion p
      join restaurant.branch b on b.id = p.branch_id
      where b.organization_id = (select restaurant.my_org_id())
    )
    or (select restaurant.is_platform_admin())
  );

-- ── notification — direct branch_id scope. 0047 already created
--    rst_org_notification_all; here we DROP the surviving blanket policy that
--    OR-bypassed it, and re-assert the scoped policy for idempotency. ──────────
drop policy if exists rst_all_authenticated     on restaurant.notification;
drop policy if exists rst_org_notification_all   on restaurant.notification;
create policy rst_org_notification_all on restaurant.notification
  for all
  using (
    branch_id in (
      select b.id from restaurant.branch b
      where b.organization_id = (select restaurant.my_org_id())
    )
    or (select restaurant.is_platform_admin())
  )
  with check (
    branch_id in (
      select b.id from restaurant.branch b
      where b.organization_id = (select restaurant.my_org_id())
    )
    or (select restaurant.is_platform_admin())
  );

commit;
