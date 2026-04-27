-- ============================================================
-- BoLe Platform — Comprehensive RLS cross-table helper functions.
-- Rewrites every cross-table RLS USING clause through SECURITY DEFINER
-- helpers so Postgres doesn't recurse when evaluating multi-join policies.
--
-- Before: matches RLS joined roles, roles RLS joined matches, hiring_managers
-- RLS joined companies, companies RLS joined hiring_managers → recursion.
-- After: every cross-table predicate is behind a SECURITY DEFINER function
-- that bypasses RLS internally.
-- ============================================================

-- ---------- helper functions ----------

create or replace function public.user_is_hm_of_role(target_role_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.roles r
    join public.hiring_managers hm on hm.id = r.hiring_manager_id
    where r.id = target_role_id and hm.profile_id = auth.uid()
  );
$$;

create or replace function public.user_is_hr_of_role(target_role_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.roles r
    join public.hiring_managers hm on hm.id = r.hiring_manager_id
    join public.companies c on c.id = hm.company_id
    join public.profiles p on p.email = c.primary_hr_email
    where r.id = target_role_id and p.id = auth.uid() and p.role = 'hr_admin'
  );
$$;

create or replace function public.user_is_hr_of_company(target_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
    join public.profiles p on p.email = c.primary_hr_email
    where c.id = target_company_id and p.id = auth.uid() and p.role = 'hr_admin'
  );
$$;

create or replace function public.user_is_hm_in_company(target_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.hiring_managers hm
    where hm.profile_id = auth.uid() and hm.company_id = target_company_id
  );
$$;

grant execute on function public.user_is_hm_of_role(uuid)    to authenticated, service_role;
grant execute on function public.user_is_hr_of_role(uuid)    to authenticated, service_role;
grant execute on function public.user_is_hr_of_company(uuid) to authenticated, service_role;
grant execute on function public.user_is_hm_in_company(uuid) to authenticated, service_role;

-- ---------- matches ----------

drop policy if exists matches_select_hm on public.matches;
create policy matches_select_hm on public.matches
  for select using (public.user_is_hm_of_role(role_id));

drop policy if exists matches_select_hr on public.matches;
create policy matches_select_hr on public.matches
  for select using (public.user_is_hr_of_role(role_id));

drop policy if exists matches_update_hm on public.matches;
create policy matches_update_hm on public.matches
  for update using (public.user_is_hm_of_role(role_id));

drop policy if exists matches_update_hr on public.matches;
create policy matches_update_hr on public.matches
  for update using (public.user_is_hr_of_role(role_id));

-- ---------- roles ----------

drop policy if exists roles_select_hr_same_company on public.roles;
create policy roles_select_hr_same_company on public.roles
  for select using (public.user_is_hr_of_role(id));

-- ---------- companies ----------

drop policy if exists companies_select_hm on public.companies;
create policy companies_select_hm on public.companies
  for select using (public.user_is_hm_in_company(id));

drop policy if exists companies_select_hr on public.companies;
create policy companies_select_hr on public.companies
  for select using (public.user_is_hr_of_company(id));

drop policy if exists companies_update_hr on public.companies;
create policy companies_update_hr on public.companies
  for update using (public.user_is_hr_of_company(id));

-- ---------- hiring_managers ----------

drop policy if exists hm_select_hr_same_company on public.hiring_managers;
create policy hm_select_hr_same_company on public.hiring_managers
  for select using (public.user_is_hr_of_company(company_id));

comment on function public.user_is_hm_of_role(uuid)    is 'RLS helper — SECURITY DEFINER to break cross-table recursion. See 0015.';
comment on function public.user_is_hr_of_role(uuid)    is 'RLS helper — SECURITY DEFINER. See 0015.';
comment on function public.user_is_hr_of_company(uuid) is 'RLS helper — SECURITY DEFINER. See 0015.';
comment on function public.user_is_hm_in_company(uuid) is 'RLS helper — SECURITY DEFINER. See 0015.';
