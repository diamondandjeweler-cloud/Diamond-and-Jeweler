-- ============================================================
-- Security: prevent users from self-promoting their own role
-- via a direct client-side UPDATE to profiles.role.
--
-- The profiles_update_self policy already blocks 'admin', but still
-- allows any authenticated user to set role = 'hr_admin' from the browser.
-- This trigger silently resets role to its previous value unless the
-- caller is authenticated as service_role (i.e. an Edge Function).
-- ============================================================

create or replace function public.prevent_role_self_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.role <> old.role then
    -- Allow only service_role (Edge Functions) to change roles.
    if coalesce(
         (current_setting('request.jwt.claims', true)::jsonb) ->> 'role',
         ''
       ) <> 'service_role' then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_change on public.profiles;
create trigger trg_prevent_role_self_change
  before update on public.profiles
  for each row
  execute function public.prevent_role_self_change();
