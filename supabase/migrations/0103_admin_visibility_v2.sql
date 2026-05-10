-- 0103 — admin visibility v2 (F8 follow-up; live verification 2026-05-10)
--
-- Live test on prod confirmed F8 still surfaces "permission denied for table
-- talents" on the Admin → Matches tab even after 0098. The is_admin() helper
-- is verified working (KpiPanel's get_admin_kpis SECURITY DEFINER RPC
-- succeeds for the same admin) — so the breakage is on the RLS / grant
-- surface around `talents`, not in the helper.
--
-- This migration takes a belt-and-braces approach: re-state the explicit
-- SELECT-allowing policies on the four tables PostgREST embeds in the
-- Admin Matches and Approvals queries (talents, hiring_managers, companies,
-- profiles), and assert table-level GRANT SELECT to authenticated. Postgres
-- "permission denied" surfaces from the GRANT layer when RLS is enabled but
-- no SELECT grant exists, and the original 0003 grants assumed setup that
-- 0089/0091/0092 may have tightened away.
--
-- Idempotent. Safe to re-run. Non-destructive: only adds/restates SELECT
-- access for the admin role; existing talent-self / HM-discovery policies
-- are untouched.

-- ── Step 1: ensure GRANT SELECT exists on the embed tables.
-- This is the most likely root cause given the "permission denied" wording
-- (RLS denies surface as empty bodies, not as PG permission errors).
grant select on public.talents          to authenticated;
grant select on public.hiring_managers  to authenticated;
grant select on public.companies        to authenticated;
grant select on public.profiles         to authenticated;
grant select on public.audit_log        to authenticated;

-- ── Step 2: explicit per-table SELECT-only admin policies, in addition to
-- whatever "for all" policies exist from 0003. PostgREST sometimes shortcuts
-- a "for all" policy in embed contexts; an explicit SELECT clause removes
-- that ambiguity.
drop policy if exists talents_select_admin on public.talents;
create policy talents_select_admin on public.talents
  for select using (public.is_admin());

drop policy if exists hiring_managers_select_admin on public.hiring_managers;
create policy hiring_managers_select_admin on public.hiring_managers
  for select using (public.is_admin());

drop policy if exists companies_select_admin on public.companies;
create policy companies_select_admin on public.companies
  for select using (public.is_admin());

-- profiles_select_admin is from 0003; restate to be safe.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (public.is_admin());

-- audit_log: 0098 already restated this; assert the grant alongside.
-- (No policy change needed if 0098 ran; the GRANT SELECT above is the
-- belt-and-braces piece for F14's read side.)

-- ── Step 3: refresh PostgREST schema cache so policy + grant changes are
-- picked up immediately.
notify pgrst, 'reload schema';

-- ── Verification (run after this migration applies):
--   Admin → Matches  should render rows or "No matches in this view." (no red error)
--   Admin → Approvals should remain working (already confirmed in live test)
--   Admin → Audit log read side stays open (already confirmed); F14 open
--     issue is the *writer*, addressed separately.
