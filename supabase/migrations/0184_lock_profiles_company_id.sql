-- =============================================================================
-- 0184 — lock profiles.company_id against self-change  (H2 defense-in-depth)
--        (2026-07-11)
-- =============================================================================
-- profiles_update_self (0003_rls.sql:42, WITH CHECK last restored in
-- 0139_security_hardening.sql) lets a user UPDATE their own profile row. It
-- constrains role / is_banned, but NOT company_id — so any authenticated user
-- can re-point their own profile at another tenant's company_id via a direct
-- client-side UPDATE, gaining that company's HM/tenant-scoped visibility.
--
-- FIX (mirrors public.prevent_role_self_change from
-- 0069_prevent_role_self_promotion.sql exactly): a BEFORE UPDATE trigger that
-- silently resets company_id to its previous value for ordinary callers, UNLESS
-- the caller is an admin (public.is_admin(), defined 0002_helpers.sql:12) or is
-- service_role (Edge Functions). `is distinct from` is used instead of `<>`
-- because company_id is nullable (0069's role column is NOT NULL, so it used `<>`).
--
-- Defense-in-depth: the real long-term fix is to add company_id to the
-- profiles_update_self WITH CHECK, but a trigger cannot be bypassed by a future
-- policy edit and matches the established 0069 pattern for role. Behaviour is
-- unchanged for every legitimate flow (users never self-set company_id; admins
-- and Edge Functions still can).
--
-- Idempotent: create or replace function / drop trigger if exists.
-- Not applied to any DB by this file. Deny coverage belongs alongside the
-- existing INVARIANT 8 (self-promote) block in supabase/tests/rls_deny.sql.
--
-- ROLLBACK: drop trigger if exists trg_prevent_company_id_self_change on public.profiles;
--           drop function if exists public.prevent_company_id_self_change();
-- =============================================================================

create or replace function public.prevent_company_id_self_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id then
    -- Allow only admins or service_role (Edge Functions) to change company_id.
    if not public.is_admin()
       and coalesce(
             (current_setting('request.jwt.claims', true)::jsonb) ->> 'role',
             ''
           ) <> 'service_role' then
      new.company_id := old.company_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_company_id_self_change on public.profiles;
create trigger trg_prevent_company_id_self_change
  before update on public.profiles
  for each row
  execute function public.prevent_company_id_self_change();
