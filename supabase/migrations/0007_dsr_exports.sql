-- ============================================================
-- BoLe Platform — DSR export storage (PDPA access / portability)
-- Creates the private bucket + storage policies used by the
-- dsr-export Edge Function to deliver each user's data package.
-- Signed URLs are 24h; after that the user re-requests.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dsr-exports', 'dsr-exports', false,
  50 * 1024 * 1024,  -- 50 MiB per export
  array['application/json', 'application/zip', 'text/plain']
)
on conflict (id) do nothing;

-- The path convention is: <user_id>/<request_id>.json
-- So (storage.foldername(name))[1] = auth.uid() iff the caller owns the export.

create policy dsr_export_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dsr-exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy dsr_export_read_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dsr-exports'
    and public.is_admin()
  );

-- Inserts happen via service-role from the Edge Function (RLS bypassed).
-- We still declare an admin insert policy for manual emergency uploads.
create policy dsr_export_write_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dsr-exports'
    and public.is_admin()
  );

create policy dsr_export_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'dsr-exports'
    and public.is_admin()
  );
