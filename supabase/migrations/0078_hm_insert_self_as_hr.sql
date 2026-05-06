-- Allow an HR admin to self-register as a hiring manager in their own
-- company. Solves the small-company case where the same person performs
-- both HR (interview scheduling) and HM (defines roles) duties.
--
-- Existing 0003_rls hm_insert was service-role only (the invite-hm Edge
-- Function bypasses RLS); regular HR users could not insert their own row.
-- This policy permits it iff:
--   1. the row's profile_id is the caller's own auth.uid(),
--   2. the row's company_id belongs to a company whose primary_hr_email
--      matches the caller's profile email (i.e. they really are the HR
--      of that company),
--   3. the caller's profile role is hr_admin.

drop policy if exists hm_insert_self_as_hr on public.hiring_managers;

create policy hm_insert_self_as_hr on public.hiring_managers
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.companies c
      join public.profiles p on p.id = auth.uid()
      where c.id = company_id
        and c.primary_hr_email = p.email
        and p.role = 'hr_admin'
    )
  );
