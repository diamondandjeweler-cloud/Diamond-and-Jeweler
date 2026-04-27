-- ============================================================
-- BoLe Platform — Storage (Milestone 1)
-- Creates private buckets + per-user / per-role RLS policies on storage.objects.
-- File paths follow the convention: {auth_uid}/<filename>
-- ============================================================

-- ---------- buckets ----------
-- Private, with MIME + size limits. Max sizes conservative for MVP.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('ic-documents',     'ic-documents',     false, 5242880,
    array['image/jpeg','image/png','image/webp','application/pdf']),
  ('resumes',          'resumes',          false, 10485760,
    array['application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('business-licenses','business-licenses',false, 5242880,
    array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- ---------- ic-documents (talent only) ----------

create policy ic_upload_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ic-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy ic_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ic-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy ic_read_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ic-documents'
    and public.is_admin()
  );

create policy ic_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ic-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy ic_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ic-documents'
    and public.is_admin()
  );

-- ---------- resumes (talent upload/read; HM read if matched; admin read all) ----------

create policy resume_upload_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy resume_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy resume_read_matched_hm on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resumes'
    and exists (
      select 1
      from public.matches m
      join public.talents t on t.id = m.talent_id
      join public.roles r on r.id = m.role_id
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where t.profile_id::text = (storage.foldername(name))[1]
        and hm.profile_id = auth.uid()
    )
  );

create policy resume_read_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resumes'
    and public.is_admin()
  );

create policy resume_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- business-licenses (HR upload/read own; admin read all) ----------

create policy license_upload_hr on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-licenses'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'hr_admin'
    )
  );

create policy license_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-licenses'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy license_read_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-licenses'
    and public.is_admin()
  );
