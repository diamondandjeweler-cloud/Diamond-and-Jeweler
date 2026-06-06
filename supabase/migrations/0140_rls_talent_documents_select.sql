-- 0140 — Wrap auth.uid() in talent_documents_select_own policy
--
-- Migration 0138 wrapped auth.uid() in (select auth.uid()) for 77 RLS policies
-- but missed the talent_documents_select_own SELECT policy (only the INSERT
-- policy was patched). This migration completes the fix so both are consistent.

ALTER POLICY "talent_documents_select_own" ON public.talent_documents
  USING ((talent_id IN ( SELECT talents.id
   FROM talents
  WHERE (talents.profile_id = (select auth.uid())))));
