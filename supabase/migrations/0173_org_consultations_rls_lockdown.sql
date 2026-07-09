-- =============================================================================
-- 0173 — org_consultations RLS lockdown (P0 fix for 0129)  (2026-07-09)
-- =============================================================================
-- 0129 shipped org_consultations with a wide-open policy:
--     CREATE POLICY org_consultations_auth_full_access FOR ALL TO authenticated
--       USING (true) WITH CHECK (true);
--     GRANT ALL ON public.org_consultations TO authenticated;
-- and a header comment promising "tighten per role in 0130" — which never
-- happened (0130 is 0130_perf_statement_timeout.sql; `org_consultations` is
-- referenced by NO other migration).
--
-- Verified live in prod (pg_policies, 2026-07-09): the ONLY policy is
-- cmd=ALL / roles={authenticated} / qual=true / with_check=true, so EVERY
-- authenticated user (any talent / HM / restaurant_staff) can SELECT, UPDATE,
-- INSERT or DELETE EVERY engagement — leaking each client company's full
-- employee roster PII (members JSONB: name + DOB + dob_city + gender for up to
-- 50 people), buyer contacts, payment records and raw consultant_notes, plus
-- payment/report tampering and deletion across all tenants. A blanket schema
-- grant also left `anon` holding table privileges (RLS's missing anon policy is
-- the only thing denying anon today).
--
-- FIX (behaviour-preserving for the real users — the owning hiring manager):
--   * Add owner_id uuid DEFAULT auth.uid(). The self-serve HM UI insert
--     (apps/web/src/routes/dashboard/OrgChartNew.tsx via
--     data/repositories/orgConsultations.ts) does not set an owner, so the
--     default stamps the creator. A client cannot forge someone else's owner:
--     the WITH CHECK below rejects any owner_id <> auth.uid() (non-admins).
--   * Replace USING(true)/WITH CHECK(true) with owner-or-admin scoping
--     (public.is_admin() already exists in prod).
--   * Strip over-broad grants: REVOKE ALL from anon + authenticated, then grant
--     only SELECT/INSERT/UPDATE back to authenticated (the policy scopes rows).
--     DELETE is intentionally NOT re-granted — the client has no delete path
--     (orgConsultations.ts = list/get/update/insert only) so admins delete
--     out-of-band; this keeps financial/PII engagement rows undeletable by users.
--
-- Prod state at write time: 0 rows (no backfill), is_admin() present, no
-- owner_id column yet. Applied live via the Management API; checked in as the
-- source-of-truth migration; covered by supabase/tests/rls_deny.sql
-- (Invariants 10 / 10b / 10c).
--
-- ROLLBACK (if needed): re-create the 0129 policy + grants:
--   drop policy "org_consultations_owner_or_admin" on public.org_consultations;
--   create policy "org_consultations_auth_full_access" on public.org_consultations
--     for all to authenticated using (true) with check (true);
--   grant all on public.org_consultations to authenticated;
--   (owner_id column may be left in place; it is additive and unused by the old policy.)
-- =============================================================================

begin;

alter table public.org_consultations
  add column if not exists owner_id uuid default auth.uid();

comment on column public.org_consultations.owner_id is
  'Auth UUID of the creating hiring manager (or admin). Scopes RLS. Defaulted '
  'to auth.uid() on insert; 0129 consultant_id/created_by are BIGINT and cannot '
  'be compared against auth.uid().';

drop policy if exists "org_consultations_auth_full_access" on public.org_consultations;

create policy "org_consultations_owner_or_admin"
  on public.org_consultations
  for all
  to authenticated
  using      (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());

revoke all on public.org_consultations from anon;
revoke all on public.org_consultations from authenticated;
revoke all on sequence public.org_consultations_id_seq from anon;

grant select, insert, update on public.org_consultations to authenticated;
grant usage, select on sequence public.org_consultations_id_seq to authenticated;

commit;
