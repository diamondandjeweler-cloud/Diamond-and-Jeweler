-- =============================================================================
-- 0172 — restaurant.org_member INSERT policy lockdown  (2026-07-09)
-- =============================================================================
-- rst_org_member_insert (0047:240, perf-rewrapped in 0138) is:
--     for insert with check (auth.role() = 'authenticated')
-- i.e. ANY authenticated user can insert an org_member row for ANY organization_id
-- and any user_id. Because my_org_id() = (select organization_id from org_member
-- where user_id = auth.uid() limit 1), a user who learns a victim organization's
-- UUID can self-insert and then read that tenant's branch / employee / orders /
-- payments via the org-scoped policies. Bounded today only by org-UUID
-- unguessability (defense-by-obscurity) and pre-launch 0 users.
--
-- Both legitimate write paths — create_org (first owner) and add_org_member
-- (invites) — are SECURITY DEFINER and bypass RLS, so tightening the direct-insert
-- WITH CHECK does not break onboarding or invitations. After this, a raw insert can
-- only add YOURSELF (user_id = auth.uid()) and only when you are already an owner of
-- your own org or a platform admin — so you can no longer inject yourself into an
-- arbitrary victim org (is_org_owner() is false for an org you don't own).
--
-- Additive/behaviour-preserving for the happy paths. Applied live via the
-- Management API; checked in as source of truth.
--
-- ROLLBACK: recreate the 0138 form:
--   create policy rst_org_member_insert on restaurant.org_member
--     for insert with check ((select auth.role()) = 'authenticated');
-- =============================================================================

begin;

drop policy if exists rst_org_member_insert on restaurant.org_member;

create policy rst_org_member_insert on restaurant.org_member
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (restaurant.is_org_owner() or restaurant.is_platform_admin())
  );

commit;
