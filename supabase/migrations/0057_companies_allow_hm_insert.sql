-- Allow hiring managers to create companies (same as hr_admin).
-- Previously only hr_admin could insert; HM users need to register their
-- company with a placeholder SSM number and have an HR Admin verify later.
drop policy if exists companies_insert_hr on public.companies;

create policy companies_insert_hr on public.companies
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('hr_admin', 'hiring_manager')
        and p.email = primary_hr_email
    )
  );
