-- ============================================================================
-- 0179 — Normalize the HR email join (case/whitespace-insensitive)
--
-- The HR-admin authorization path joins profiles.email to
-- companies.primary_hr_email as RAW text. The pattern originates in migration
-- 0015 (user_is_hr_of_company / user_is_hr_of_role) and was copied into
-- 0080 (profile_visible_to_company_hr) and 0124 (auth_hr_company_id).
-- If the two values differ only in case ("HR@Acme.com" vs "hr@acme.com") or
-- carry stray whitespace (trailing space from a form paste), the join finds
-- no row and the HR admin is silently locked out of their own company —
-- companies, hiring_managers, roles, matches, interviews all read empty.
--
-- Fix: normalize BOTH sides with lower(trim(...)) inside each SECURITY
-- DEFINER helper. Semantics otherwise identical; every attribute of the
-- original definitions (language, STABLE, SECURITY DEFINER, SET search_path,
-- parameter names/types, return type, grants) is preserved exactly.
--
-- Helpers redefined here (current definition → source migration):
--   • user_is_hr_of_role(uuid)            — 0015 (LEAKPROOF added in 0133)
--   • user_is_hr_of_company(uuid)         — 0015 (LEAKPROOF added in 0133)
--   • profile_visible_to_company_hr(uuid) — 0080
--   • auth_hr_company_id()                — 0124
--
-- CREATE OR REPLACE resets LEAKPROOF, so it is re-applied below for the two
-- functions 0133 marked. auth_hr_company_id had no explicit grant in 0124
-- (Supabase default privileges) and CREATE OR REPLACE preserves the existing
-- ACL, so no grant is issued for it here.
--
-- Deliberately NOT touched (policies, not helpers — they inline the raw
-- comparison and are tracked separately): companies_insert_hr (0057),
-- link_req_hr_manage (0065), hm_insert_self_as_hr (0078),
-- matches_select_hr (0064), companies_update_creator_unverified +
-- license_upload_company_creator (0127), companies_insert/select/update_hr
-- remnants in 0003 already superseded by 0015/0057.
--
-- Idempotent: CREATE OR REPLACE / GRANT / ALTER ... LEAKPROOF / COMMENT only.
-- ============================================================================

-- ---------- user_is_hr_of_role (origin 0015) ----------

create or replace function public.user_is_hr_of_role(target_role_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.roles r
    join public.hiring_managers hm on hm.id = r.hiring_manager_id
    join public.companies c on c.id = hm.company_id
    join public.profiles p on lower(trim(p.email)) = lower(trim(c.primary_hr_email))
    where r.id = target_role_id and p.id = auth.uid() and p.role = 'hr_admin'
  );
$$;

-- ---------- user_is_hr_of_company (origin 0015) ----------

create or replace function public.user_is_hr_of_company(target_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
    join public.profiles p on lower(trim(p.email)) = lower(trim(c.primary_hr_email))
    where c.id = target_company_id and p.id = auth.uid() and p.role = 'hr_admin'
  );
$$;

-- ---------- profile_visible_to_company_hr (origin 0080) ----------

create or replace function public.profile_visible_to_company_hr(target_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.hiring_managers hm
    join public.companies c on c.id = hm.company_id
    join public.profiles p on lower(trim(p.email)) = lower(trim(c.primary_hr_email))
    where hm.profile_id = target_profile_id
      and p.id = auth.uid()
      and p.role = 'hr_admin'
  );
$$;

-- ---------- auth_hr_company_id (origin 0124) ----------

CREATE OR REPLACE FUNCTION public.auth_hr_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT c.id
  FROM public.companies c
  JOIN public.profiles p ON lower(trim(p.email)) = lower(trim(c.primary_hr_email))
  WHERE p.id = auth.uid()
    AND p.role = 'hr_admin'
  LIMIT 1;
$$;

-- ---------- grants (re-issue exactly as the source migrations did) ----------
-- CREATE OR REPLACE preserves the existing ACL; these are restated for
-- self-containment and are no-ops on re-run.

grant execute on function public.user_is_hr_of_role(uuid)            to authenticated, service_role;
grant execute on function public.user_is_hr_of_company(uuid)         to authenticated, service_role;
grant execute on function public.profile_visible_to_company_hr(uuid) to authenticated, service_role;

-- ---------- restore LEAKPROOF (0133) — reset by CREATE OR REPLACE ----------
-- Same rationale as 0133: boolean EXISTS, no per-row exceptions, no side
-- effects; lower()/trim() do not throw on valid text. Requires superuser;
-- runs as postgres on managed Supabase (same channel that applied 0133).

-- 2026-07-10 apply note: the Management API role is NOT superuser and
-- "ALTER FUNCTION ... LEAKPROOF" fails with 42501. Verified live before this
-- apply: all four helpers already have proleakproof = false in prod (0133's
-- marking did not survive later CREATE OR REPLACE rewraps), so skipping the
-- alter loses nothing versus current prod. Guarded so the migration stays
-- appliable on any channel; a superuser can re-mark both helpers later.
do $do$
begin
  begin
    alter function public.user_is_hr_of_role(uuid)    leakproof;
    alter function public.user_is_hr_of_company(uuid) leakproof;
  exception when insufficient_privilege then
    raise notice '0179: skipping LEAKPROOF (needs superuser); helpers stay non-leakproof as in current prod';
  end;
end
$do$;

-- ---------- provenance comments ----------

comment on function public.user_is_hr_of_role(uuid)    is 'RLS helper — SECURITY DEFINER. See 0015; email join normalized lower(trim()) in 0179.';
comment on function public.user_is_hr_of_company(uuid) is 'RLS helper — SECURITY DEFINER. See 0015; email join normalized lower(trim()) in 0179.';
comment on function public.profile_visible_to_company_hr(uuid) is
  'RLS helper — SECURITY DEFINER. True iff the caller is HR admin of a company that has the target profile as a hiring manager. Used by profiles_select_hr_for_hms. See 0080; email join normalized lower(trim()) in 0179.';
comment on function public.auth_hr_company_id() is
  'RLS helper — SECURITY DEFINER. Company uuid the caller is HR admin of (or NULL). Used by interviews_all_hr. See 0124; email join normalized lower(trim()) in 0179.';
