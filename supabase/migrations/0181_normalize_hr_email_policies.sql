-- ============================================================================
-- 0181 — finish 0179: normalize the remaining raw HR-email comparisons
--
-- 0179 normalized the 4 SECURITY DEFINER helpers, but ~5 RLS policies still
-- compared profiles.email = companies.primary_hr_email as RAW text (audit
-- 2026-07-10, "split-brain authz surface"): a case-variant HR admin unlocked
-- by 0179 could read companies/roles/interviews via the helpers yet still get
-- zero rows from matches_select_hr and could not approve link requests.
--
-- Three policies delegate to the (now normalized) helpers — their inline
-- bodies were structurally IDENTICAL to the helper bodies (verified against
-- the live definitions from 0138), so this is consolidation + normalization,
-- not a semantic change. Two policies keep inline predicates (their email
-- branch has no hr_admin requirement, so the helpers don't apply) and get
-- lower(trim()) inline. The 0180 unique index on lower(trim(primary_hr_email))
-- guarantees a normalized email cannot bind two companies.
--
-- Idempotent: ALTER POLICY is a full-replace of USING/WITH CHECK; the storage
-- policy is guarded drop+create (skipped with a NOTICE if the channel lacks
-- storage.objects privileges).
-- ============================================================================

-- ---------- 1. matches_select_hr → delegate to user_is_hr_of_role ----------
-- Was (0064, rewrapped 0138): status <> 'pending_approval' AND EXISTS(
--   roles JOIN hiring_managers JOIN companies JOIN profiles ON raw email;
--   p.id = auth.uid() AND p.role = 'hr_admin')  — identical to the helper body.
ALTER POLICY "matches_select_hr" ON public.matches
  USING (((status <> 'pending_approval'::text) AND public.user_is_hr_of_role(role_id)));

-- ---------- 2. link_req_hr_manage → delegate to user_is_hr_of_company ----------
ALTER POLICY "link_req_hr_manage" ON public.company_hm_link_requests
  USING (public.user_is_hr_of_company(company_id))
  WITH CHECK (public.user_is_hr_of_company(company_id));

-- ---------- 3. hm_insert_self_as_hr → delegate to user_is_hr_of_company ----------
ALTER POLICY "hm_insert_self_as_hr" ON public.hiring_managers
  WITH CHECK (((profile_id = (select auth.uid())) AND public.user_is_hr_of_company(company_id)));

-- ---------- 4. companies_update_creator_unverified → inline normalize ----------
-- Email branch has NO hr_admin requirement (any profile whose email matches
-- may update an unverified company) so it cannot delegate to the helper.
ALTER POLICY "companies_update_creator_unverified" ON public.companies
  USING (((verified = false) AND ((created_by = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (lower(trim(p.email)) = lower(trim(companies.primary_hr_email)))))))))
  WITH CHECK (((verified = false) AND ((created_by = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (lower(trim(p.email)) = lower(trim(companies.primary_hr_email)))))))));

-- ---------- 5. license_upload_company_creator (storage) → inline normalize ----------
-- Guarded: storage.objects policy management may be restricted on some apply
-- channels; 0127 succeeded on this channel, but degrade to a NOTICE not a txn
-- abort if privileges are ever tightened.
do $do$
begin
  begin
    drop policy if exists license_upload_company_creator on storage.objects;
    create policy license_upload_company_creator on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'business-licenses'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and exists (
          select 1
          from public.companies c
          left join public.profiles p on p.id = (select auth.uid())
          where c.verified = false
            and (
              c.created_by = (select auth.uid())
              or lower(trim(c.primary_hr_email)) = lower(trim(p.email))
            )
        )
      );
  exception when insufficient_privilege then
    raise notice '0181: skipping storage.objects policy (insufficient privilege on this channel) — re-run via SQL editor';
  end;
end
$do$;

notify pgrst, 'reload schema';
