-- Allow an HR admin to read the profile rows of hiring managers in their
-- own company. Without this, the HR dashboard's §1 "Your hiring managers"
-- list (which joins profiles for full_name) silently drops every row whose
-- profile_id != auth.uid(), because profiles_select_self is the only path.
--
-- Recursion safety: the inner EXISTS calls public.user_is_hr_of_company(uuid)
-- (added in migration 0015), which is SECURITY DEFINER and bypasses RLS — so
-- the profiles policy doesn't recurse through profiles when evaluating.

drop policy if exists profiles_select_hr_for_hms on public.profiles;

create policy profiles_select_hr_for_hms on public.profiles
  for select using (
    exists (
      select 1
      from public.hiring_managers hm
      where hm.profile_id = profiles.id
        and public.user_is_hr_of_company(hm.company_id)
    )
  );
