-- ============================================================
-- F28 fix — Dev seed RLS denial
--
-- DIAGNOSIS (2026-05-11):
--   pg_policies shows talents_all_admin (cmd=ALL, using=is_admin(),
--   with_check=is_admin()) — admin policy ALREADY exists.
--
--   The real gap is at the TABLE-GRANT layer: `authenticated` is
--   missing SELECT and UPDATE grants on public.talents. RLS policies
--   are gated by PG GRANTs; an admin's JWT carries role=authenticated,
--   so even though the policy permits the action, the SQL planner
--   denies before policy evaluation:
--     "permission denied for table talents"
--
--   Migration 0103 added GRANT SELECT for the same reason on related
--   tables but left talents.UPDATE absent. This adds both.
--
-- AUDIT: the existing audit_log triggers on public.talents continue
-- to capture every admin write — no accountability is weakened.
-- ============================================================

grant select, update on public.talents to authenticated;

-- Sanity: confirm the grants stuck.
do $$
declare
  has_select boolean;
  has_update boolean;
begin
  select bool_or(privilege_type = 'SELECT'),
         bool_or(privilege_type = 'UPDATE')
    into has_select, has_update
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'talents'
    and grantee = 'authenticated';
  if not has_select then raise exception '0105: GRANT SELECT failed'; end if;
  if not has_update then raise exception '0105: GRANT UPDATE failed'; end if;
end $$;

-- Refresh PostgREST schema cache so the change is visible immediately.
notify pgrst, 'reload schema';
