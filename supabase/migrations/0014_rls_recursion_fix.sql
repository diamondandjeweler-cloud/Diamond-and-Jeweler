-- ============================================================
-- BoLe Platform — Fix infinite recursion between matches & roles RLS
--
-- The `roles_select_talent_via_match` policy (from 0003) joins `matches`,
-- and `matches_select_hm` joins `roles`. When an authenticated user queries
-- matches, Postgres evaluates every PERMISSIVE policy, follows the joins
-- into roles, evaluates roles RLS (which re-enters matches), and errors:
-- "infinite recursion detected in policy for relation matches".
--
-- Fix: replace the cross-table USING clauses with SECURITY DEFINER helpers
-- that bypass RLS internally. Semantically identical, but Postgres doesn't
-- recurse through them.
-- ============================================================

-- ---------- helpers ----------

create or replace function public.talent_can_see_role(target_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    join public.talents t on t.id = m.talent_id
    where m.role_id = target_role_id
      and t.profile_id = auth.uid()
  );
$$;

create or replace function public.hm_can_see_talent(target_talent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    join public.roles r on r.id = m.role_id
    join public.hiring_managers hm on hm.id = r.hiring_manager_id
    where m.talent_id = target_talent_id
      and hm.profile_id = auth.uid()
  );
$$;

grant execute on function public.talent_can_see_role(uuid) to authenticated, service_role;
grant execute on function public.hm_can_see_talent(uuid)  to authenticated, service_role;

-- ---------- rewrite the recursive policies ----------

drop policy if exists roles_select_talent_via_match on public.roles;
create policy roles_select_talent_via_match on public.roles
  for select using (public.talent_can_see_role(id));

drop policy if exists talents_select_hm_via_match on public.talents;
create policy talents_select_hm_via_match on public.talents
  for select using (public.hm_can_see_talent(id));

comment on function public.talent_can_see_role(uuid) is
  'SECURITY DEFINER helper breaking the RLS recursion between matches and roles. See migration 0014.';
comment on function public.hm_can_see_talent(uuid) is
  'SECURITY DEFINER helper breaking the RLS recursion between matches and talents. See migration 0014.';
