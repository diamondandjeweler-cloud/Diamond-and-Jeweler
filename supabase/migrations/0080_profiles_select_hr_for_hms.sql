-- Allow an HR admin to read the profile rows of hiring managers in their
-- own company. Without this, the HR dashboard's §1 "Your hiring managers"
-- list (which joins profiles for full_name) silently drops every row whose
-- profile_id != auth.uid(), because profiles_select_self is the only path.
--
-- IMPORTANT — recursion safety:
--   An earlier attempt placed the EXISTS(SELECT FROM hiring_managers ...)
--   directly in the policy body. That triggered RLS evaluation on
--   hiring_managers, which has policy hm_select_hr_floating that itself
--   queries public.profiles → infinite recursion (Postgres error 42P17).
--
--   This version pushes the entire join into a SECURITY DEFINER helper.
--   Because the helper runs as the function owner (postgres) it bypasses
--   RLS on every table it touches — the chain is broken, no recursion.
--   Same shape as the helpers in migration 0015.

create or replace function public.profile_visible_to_company_hr(target_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.hiring_managers hm
    join public.companies c on c.id = hm.company_id
    join public.profiles p on p.email = c.primary_hr_email
    where hm.profile_id = target_profile_id
      and p.id = auth.uid()
      and p.role = 'hr_admin'
  );
$$;

comment on function public.profile_visible_to_company_hr(uuid) is
  'RLS helper — SECURITY DEFINER. True iff the caller is HR admin of a company that has the target profile as a hiring manager. Used by profiles_select_hr_for_hms.';

grant execute on function public.profile_visible_to_company_hr(uuid) to authenticated, service_role;

drop policy if exists profiles_select_hr_for_hms on public.profiles;

create policy profiles_select_hr_for_hms on public.profiles
  for select using (public.profile_visible_to_company_hr(id));
