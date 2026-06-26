-- ============================================================================
-- 0155 — Close self-promotion-to-admin at signup (handle_new_user)
--
-- VULNERABILITY (privilege escalation, critical):
--   public.handle_new_user() (0001) creates the profile row using
--   coalesce(new.raw_user_meta_data->>'role', 'talent'). raw_user_meta_data is
--   entirely client-controlled — set via supabase.auth.signUp({ options.data })
--   in the browser. An attacker can call the public /auth/v1/signup endpoint
--   with data.role = 'admin' and the trigger inserts a profile with role='admin'.
--
--   The existing prevent_role_self_change() trigger (0069) only guards UPDATE,
--   not the INSERT performed here, so it does not block this path. No
--   application code path is supposed to ever mint an admin via signup:
--   admin-change-role and switch-account-type both restrict roles to
--   talent|hiring_manager|hr_admin. Admin is provisioned out-of-band only.
--
-- FIX:
--   Honour talent | hiring_manager | hr_admin from signup metadata (the
--   intended self-service HR/HM signup flow depends on this), but coerce any
--   'admin' (or unknown value) coming from client metadata down to 'talent'.
--   Idempotent CREATE OR REPLACE; trigger binding unchanged.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested text := new.raw_user_meta_data->>'role';
  v_role      text;
begin
  -- Allowlist self-service roles only. 'admin' is never assignable from
  -- client-controlled signup metadata; anything else falls back to 'talent'.
  if v_requested in ('talent', 'hiring_manager', 'hr_admin') then
    v_role := v_requested;
  else
    v_role := 'talent';
  end if;

  insert into public.profiles (id, email, full_name, role, consents)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role,
    coalesce(new.raw_user_meta_data->'consents', '{}'::jsonb)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
