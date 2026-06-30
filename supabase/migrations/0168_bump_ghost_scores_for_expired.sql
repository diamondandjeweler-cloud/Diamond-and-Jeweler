-- ============================================================================
-- 0168 — bump_ghost_scores_for_expired: collapse match-expire's ghost-score N+1
--
-- v4 §16 ghost-score auto-increment ran, PER match-expire invocation:
--   • per expired talent: 1 count + 1 profile read + 1 conditional update
--   • per expired role:    1 HM lookup + 1 count + 1 profile read + 1 update
-- i.e. ~4×talents + ~5×roles serial round-trips inside the 6h cron.
--
-- This RPC does both passes SET-BASED in one round-trip, byte-identical to the
-- per-row logic in match-expire/index.ts:178-215:
--   • talent ghost count = expired matches with accepted_at IS NULL;
--   • HM ghost count = expired matches with invited_at IS NULL across ALL of
--     that HM's roles;
--   • target = LEAST(10, FLOOR(ghosted/3)); only counted when ghosted >= 3
--     (so target >= 1); profiles.ghost_score is only ever raised, never lowered;
--   • only the talents / HMs whose match expired THIS run are re-evaluated
--     (scoped by the p_talent_ids / p_role_ids passed in).
--
-- SECURITY INVOKER (default): match-expire calls it as service_role.
-- ============================================================================

create or replace function public.bump_ghost_scores_for_expired(
  p_talent_ids uuid[],
  p_role_ids   uuid[]
)
returns void
language plpgsql
set search_path = public
as $$
begin
  -- ---- talent ghosting: expired matches the talent never accepted ----
  with tg as (
    select t.profile_id,
           least(10, floor(count(*) / 3))::int as target
    from   public.talents t
    join   public.matches m
      on   m.talent_id = t.id
     and   m.status = 'expired'
     and   m.accepted_at is null
    where  t.id = any(p_talent_ids)
      and  t.profile_id is not null
    group by t.profile_id
    having count(*) >= 3
  )
  update public.profiles p
     set ghost_score = tg.target
    from tg
   where p.id = tg.profile_id
     and p.ghost_score < tg.target;

  -- ---- HM ghosting: expired matches the HM never invited, across all roles ----
  with hms as (
    select distinct hm.profile_id, hm.id as hm_id
    from   public.roles r
    join   public.hiring_managers hm on hm.id = r.hiring_manager_id
    where  r.id = any(p_role_ids)
      and  hm.profile_id is not null
  ),
  hg as (
    select hms.profile_id,
           least(10, floor(count(*) / 3))::int as target
    from   hms
    join   public.roles r2 on r2.hiring_manager_id = hms.hm_id
    join   public.matches m
      on   m.role_id = r2.id
     and   m.status = 'expired'
     and   m.invited_at is null
    group by hms.profile_id
    having count(*) >= 3
  )
  update public.profiles p
     set ghost_score = hg.target
    from hg
   where p.id = hg.profile_id
     and p.ghost_score < hg.target;
end;
$$;

revoke all on function public.bump_ghost_scores_for_expired(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.bump_ghost_scores_for_expired(uuid[], uuid[]) to service_role;

notify pgrst, 'reload schema';
