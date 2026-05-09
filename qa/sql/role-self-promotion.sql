-- DNJ Launch QA — role self-promotion block
-- Migration 0069_prevent_role_self_promotion.sql added a check.
-- Verify a talent cannot UPDATE their own profile.role to 'admin'.
--
-- Run via PAT — service-role bypasses RLS, so this is a structural
-- assertion: the policy exists and contains the correct guard.

select
  policyname,
  cmd,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
  and cmd = 'UPDATE'
  and (
    -- The with_check should mention role + a constraint that blocks 'admin'.
    coalesce(with_check, '') !~* 'role'
    or coalesce(with_check, '') ~* 'admin'  -- the check should LIST allowed roles, not just permit admin
  )
order by policyname;
-- 0 rows = policies look right
-- N rows = a policy is missing the guard or allows self-elevation
