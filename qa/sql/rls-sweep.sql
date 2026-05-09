-- DNJ Launch QA — RLS sweep
-- Run via: PSQL or Supabase Management API.
-- Returns one row per (table, expected) where reality disagrees.

-- 1. Every PII / IP table must have rowsecurity = TRUE.
with protected as (
  select unnest(array[
    'profiles','talents','hiring_managers','companies','roles',
    'matches','match_history','interviews','data_requests','waitlist',
    'notifications','admin_actions','audit_log','support_tickets',
    'life_chart_compatibility','life_chart_cache','character_anchor_years'
  ]) as tablename
),
rls_status as (
  select t.tablename,
         coalesce(p.rowsecurity, false) as has_rls
  from protected t
  left join pg_tables p on p.schemaname = 'public' and p.tablename = t.tablename
)
select tablename, 'rowsecurity FALSE' as failure
from rls_status
where has_rls = false

union all

-- 2. Every protected table must have at least one policy.
select t.tablename, '0 policies' as failure
from (
  select unnest(array[
    'profiles','talents','hiring_managers','companies','roles',
    'matches','match_history','interviews','data_requests','waitlist',
    'notifications','admin_actions','audit_log','support_tickets',
    'life_chart_compatibility','life_chart_cache','character_anchor_years'
  ]) as tablename
) t
left join pg_policies pol on pol.schemaname = 'public' and pol.tablename = t.tablename
group by t.tablename
having count(pol.policyname) = 0

union all

-- 3. life_chart_compatibility must NOT have any policy that grants
--    SELECT to authenticated/anon (it's IP, admin-only).
select 'life_chart_compatibility',
       'policy "' || policyname || '" allows ' || coalesce(roles::text, 'public')
from pg_policies
where schemaname = 'public'
  and tablename = 'life_chart_compatibility'
  and 'authenticated' = any(coalesce(roles, array['authenticated']::name[]))
  and cmd in ('SELECT','ALL');
