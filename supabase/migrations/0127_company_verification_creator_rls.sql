-- ============================================================
-- Company verification RLS — let the creator (or the primary HR
-- email holder) complete verification on an unverified company.
--
-- Bug: a Hiring Manager registers a company in CompanyRegister (no
-- SSM / license), then later opens CompanyVerify to upload them.
-- The legacy storage policy `license_upload_hr` and the table
-- policy `companies_update_hr` both require role = 'hr_admin' AND
-- email match, which the HM fails on both counts, so the upload
-- bombs with "new row violates row-level security policy".
--
-- Fix: add two parallel policies scoped to verified = false so
-- (a) the creator and (b) the user whose email matches
-- primary_hr_email can complete verification. Once an admin flips
-- verified = true, both policies stop granting access.
-- ============================================================

-- ---------- storage.objects: business-licenses upload ----------

drop policy if exists license_upload_company_creator on storage.objects;

create policy license_upload_company_creator on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-licenses'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.companies c
      left join public.profiles p on p.id = auth.uid()
      where c.verified = false
        and (
          c.created_by = auth.uid()
          or c.primary_hr_email = p.email
        )
    )
  );

-- ---------- public.companies: update for verification ----------

drop policy if exists companies_update_creator_unverified on public.companies;

create policy companies_update_creator_unverified on public.companies
  for update
  using (
    verified = false
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.email = companies.primary_hr_email
      )
    )
  )
  with check (
    verified = false
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.email = companies.primary_hr_email
      )
    )
  );
