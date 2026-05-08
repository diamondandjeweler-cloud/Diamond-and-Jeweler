-- 0093_fix_roles_recursion.sql
--
-- LAUNCH-CRITICAL: roles_select_talent_via_match was rewritten somewhere
-- after migration 0014 (which originally introduced talent_can_see_role()
-- to avoid recursion) and reverted to inline EXISTS that joins matches.
-- This created infinite RLS recursion when an authenticated user query
-- traversed the matches ↔ roles policy chain.
--
-- Symptom: storage.objects RLS evaluation for resume_read_matched_hm
-- (which selects from matches) tripped the recursion, causing the
-- storage-api Node service to surface
--   `503 DatabaseInvalidObjectDefinition: schema is invalid or incompatible`
-- on every authenticated storage call (resume reads, IC uploads, etc.).
-- Anon and service_role calls bypassed the policy and worked fine.
--
-- Fix: drop the inline-EXISTS policy and recreate it using the existing
-- SECURITY DEFINER helper public.talent_can_see_role(role_id), which
-- bypasses RLS evaluation on its inner subquery.

drop policy if exists roles_select_talent_via_match on public.roles;

create policy roles_select_talent_via_match on public.roles
  for select to authenticated
  using (
    moderation_status = 'approved'
    and public.talent_can_see_role(id)
  );

-- End of 0093
