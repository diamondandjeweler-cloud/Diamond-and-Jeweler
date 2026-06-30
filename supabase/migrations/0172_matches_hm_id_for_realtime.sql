-- ============================================================
-- matches.hm_id — denormalised hiring-manager id for realtime filtering
-- ============================================================
-- The HM dashboard subscribes to `matches` realtime changes with a
-- server-side filter built from a comma-list of role ids
-- (filter: role_id=in.(...)). That list grows with every role an HM owns
-- and must be re-derived + the channel resubscribed whenever a role is
-- added. A single equality filter on the owning HM is both cheaper and
-- stable per user.
--
-- This migration is ADDITIVE and non-breaking: the column is nullable,
-- backfilled, and kept populated by a BEFORE INSERT trigger. NOTHING reads
-- hm_id yet — the dashboard subscription switch to `hm_id=eq.<id>` is a
-- separate, behaviour-changing follow-up (see TODO in
-- apps/web/src/routes/dashboard/hm/useHmDashboardData.tsx).

-- 1) Column: nullable, FK mirrors roles.hiring_manager_id semantics.
alter table public.matches
  add column if not exists hm_id uuid references public.hiring_managers(id) on delete cascade;

-- 2) Index for the future equality filter on the realtime stream.
create index if not exists idx_matches_hm on public.matches(hm_id);

-- 3) Backfill from the owning role's hiring_manager_id.
update public.matches m
  set hm_id = r.hiring_manager_id
  from public.roles r
  where m.role_id = r.id
    and m.hm_id is distinct from r.hiring_manager_id;

-- 4) Keep hm_id populated on every insert path (matcher, admin-force-match,
--    manual) by deriving it from the row's role_id when not supplied.
--    SECURITY DEFINER so the lookup is unaffected by the caller's RLS on roles.
create or replace function public.tg_matches_set_hm_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hm_id is null then
    select r.hiring_manager_id into new.hm_id
      from public.roles r
      where r.id = new.role_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_matches_set_hm_id() from public;

drop trigger if exists tg_matches_set_hm_id on public.matches;
create trigger tg_matches_set_hm_id
  before insert on public.matches
  for each row execute function public.tg_matches_set_hm_id();
