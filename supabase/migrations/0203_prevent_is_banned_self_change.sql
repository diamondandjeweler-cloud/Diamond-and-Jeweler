-- =============================================================================
-- 0203 — banned user can self-unban via a direct PostgREST UPDATE
--        (CRITICAL, finding auth-rls-1)                             (2026-07-13)
-- =============================================================================
-- A banned user still holds a valid JWT (a ban does not revoke the token). The
-- profiles_update_self policy USING is a bare (auth.uid() = id), and its
-- WITH CHECK requires the NEW row's is_banned = false — which BLOCKS self-banning
-- but PERMITS clearing the flag to false. `authenticated` holds column
-- UPDATE(is_banned) (re-granted in 0187:27), and NO trigger guards is_banned
-- (0069 guards role, 0184 guards company_id, 0186 guards companies.verified).
-- So a banned user can
--   PATCH /rest/v1/profiles?id=eq.<own_uid> {"is_banned": false}
-- with their still-valid token; the row flips to is_banned = false and
-- _shared/auth.ts re-reads it live on the next call, fully lifting the ban.
--
-- FIX (exact analog of prevent_role_self_change 0069 /
-- prevent_company_id_self_change 0184): a BEFORE UPDATE trigger that silently
-- resets NEW.is_banned to OLD.is_banned unless the caller is a platform admin
-- (public.is_admin(), 0002_helpers.sql:12) or service_role (Edge Functions).
--
-- NOTE: the 0187 authenticated column grant on is_banned is intentionally LEFT
-- IN PLACE. role/company_id/verified are all kept in their column grants and
-- protected solely by their triggers; is_banned follows the same pattern so an
-- admin-initiated ban performed via the authenticated client (under a profiles
-- admin policy) still succeeds — the trigger is the single source of truth.
-- is_admin() itself returns false for a banned admin (it checks is_banned=false),
-- so a banned admin cannot self-unban either.
--
-- Idempotent: create or replace function / drop trigger if exists. Author-only —
-- owner must apply. Deny coverage added alongside INVARIANT 8 in
-- supabase/tests/rls_deny.sql.
--
-- ROLLBACK:
--   drop trigger if exists trg_prevent_ban_self_change on public.profiles;
--   drop function if exists public.prevent_ban_self_change();
-- =============================================================================

create or replace function public.prevent_ban_self_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.is_banned is distinct from old.is_banned then
    -- Only a platform admin or service_role (Edge Functions) may change is_banned.
    if not public.is_admin()
       and coalesce(
             (current_setting('request.jwt.claims', true)::jsonb) ->> 'role',
             ''
           ) <> 'service_role' then
      new.is_banned := old.is_banned;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_ban_self_change on public.profiles;
create trigger trg_prevent_ban_self_change
  before update on public.profiles
  for each row
  execute function public.prevent_ban_self_change();
