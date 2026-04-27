-- ============================================================
-- BoLe Platform — Hiring-manager visibility on cold_start_queue
-- Per v4 PRD §17: when a role has <3 eligible talents, the HM
-- should see an in-app waiting-period message ("Not enough
-- talents yet. Estimated wait: N days.").
--
-- match-generate already inserts a cold_start_queue row when
-- eligible talents < limit (see functions/match-generate). Until
-- this migration, that row was admin-only. We now let the role's
-- hiring manager SELECT their own row so the UI can surface it.
-- ============================================================

create policy cold_start_select_own_hm on public.cold_start_queue
  for select using (
    exists (
      select 1
      from public.roles r
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where r.id = cold_start_queue.role_id
        and hm.profile_id = auth.uid()
    )
  );

comment on policy cold_start_select_own_hm on public.cold_start_queue is
  'Hiring managers can read the cold-start flag for roles they own, to power the waiting-period UI in v4 §17.';

-- Exposes ONLY the active-talent count to the waiting-period UI. RLS on
-- public.talents prevents HMs from reading rows they are not matched with,
-- so a direct count would under-count. This helper is SECURITY DEFINER +
-- returns a single integer (no rows, no PII).
create or replace function public.active_talent_count()
returns integer
language sql
security definer
stable
as $$
  select count(*)::integer
  from public.talents t
  join public.profiles p on p.id = t.profile_id
  where t.is_open_to_offers = true
    and coalesce(p.is_banned, false) = false;
$$;

grant execute on function public.active_talent_count() to authenticated;

comment on function public.active_talent_count() is
  'Count of active talents open to offers. Used by the v4 waiting-period UI to pick a threshold band. Intentionally returns only a scalar.';
