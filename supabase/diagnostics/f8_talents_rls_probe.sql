-- F8 diagnostic — run as SERVICE ROLE in Supabase SQL editor.
-- Goal: explain why an authenticated admin gets "permission denied for table talents"
-- on the Admin → Matches tab, even though KpiPanel (SECURITY DEFINER RPC) succeeds.
--
-- Run each block separately; stop at the first one that surfaces a non-obvious result.

-- 1. Is RLS even enabled on talents?
select c.relname,
       c.relrowsecurity  as rls_enabled,
       c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'talents';

-- 2. What policies currently exist on talents?
-- Expect: talents_all_admin (cmd=ALL, qual=is_admin())
--         + the talent-self / hm-discovery policies from 0003.
select polname,
       case polcmd when 'r' then 'SELECT'
                   when 'a' then 'INSERT'
                   when 'w' then 'UPDATE'
                   when 'd' then 'DELETE'
                   when '*' then 'ALL' end as cmd,
       polroles::regrole[] as roles,
       pg_get_expr(polqual, polrelid)      as using_clause,
       pg_get_expr(polwithcheck, polrelid) as check_clause
  from pg_policy
 where polrelid = 'public.talents'::regclass
 order by polname;

-- 3. Are table grants present? PostgREST requires GRANT SELECT to authenticated
--    even when an RLS policy would allow it. "permission denied" with no
--    qualifier is the GRANT-missing fingerprint; an RLS deny gives an empty
--    body / no-rows.
select grantee, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public' and table_name = 'talents'
 order by grantee, privilege_type;

-- 4. Cross-check: what's the admin's profile look like?
-- Replace <admin_email> below.
select id, email, role, is_banned
  from public.profiles
 where email = '<admin_email>';

-- 5. Sanity-check: does is_admin() return true when impersonating that user?
-- Run inside a transaction so the role/claim reset is automatic.
begin;
  -- Replace <admin_uuid> with the id from step 4.
  set local role authenticated;
  set local "request.jwt.claim.sub" to '<admin_uuid>';
  select public.is_admin();
  -- Same view the panel attempts:
  select count(*) from public.talents;
rollback;

-- 6. If 5 fails with "permission denied", drop the explicit grant test:
-- (run as service role / superuser)
grant select on public.talents to authenticated;
notify pgrst, 'reload schema';
-- Re-run step 5. If it now succeeds, the missing grant is the bug — apply
-- migrations/0103_admin_visibility_v2.sql for a permanent fix.

-- 7. Sister tables that PostgREST embeds in the same MatchPanel query —
-- check the same things on these:
--   hiring_managers, companies, profiles
-- (Approvals embed needs hiring_managers; Audit panel needs profiles)
select c.relname, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('talents','hiring_managers','companies','profiles','audit_log');

-- 8. Audit-log writer health (separate from F8, related to F14).
-- F14 surfaced as 0 rows. If the read policy is fine (it is — Audit log tab
-- renders without RLS error), then the write side (triggers / audit_event
-- helper) likely isn't firing on auth events.
select count(*) as audit_rows_total,
       max(created_at) as latest_event_at,
       min(created_at) as earliest_event_at
  from public.audit_log;

-- If audit_rows_total = 0, check whether the writer functions exist:
select proname, prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and proname in ('audit_event','log_auth_event','log_admin_read');
