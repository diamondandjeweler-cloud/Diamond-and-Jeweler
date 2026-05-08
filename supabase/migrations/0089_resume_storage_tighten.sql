-- 0089_resume_storage_tighten.sql
-- Tighten the HM resume read policy. Previously (0004_storage.sql:75-88) any HM
-- with ANY matches row could SELECT a talent's resume, regardless of match
-- status. The product UI only surfaces the resume after the talent has
-- actively engaged (accepted_by_talent and beyond) — bringing storage RLS in
-- line with that contract closes a direct-API gap (a curious HM hitting
-- supabase storage with their own token could fetch a resume even when the
-- talent had only been "generated"/"viewed").
--
-- Allowed states (HM may read resume) — ones in which the talent has
-- demonstrably consented to interview engagement:
--   accepted_by_talent, invited_by_manager, hr_scheduling,
--   interview_scheduled, interview_completed, offer_made, hired
--
-- Denied states:
--   generated, viewed, declined_by_talent, declined_by_manager, expired

drop policy if exists resume_read_matched_hm on storage.objects;

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
        and m.status in (
          'accepted_by_talent',
          'invited_by_manager',
          'hr_scheduling',
          'interview_scheduled',
          'interview_completed',
          'offer_made',
          'hired'
        )
    )
  );
