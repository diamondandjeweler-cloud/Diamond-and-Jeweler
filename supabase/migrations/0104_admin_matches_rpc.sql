-- 0104 — get_admin_matches() RPC for the Admin → Matches tab (F8 fix path).
--
-- Live verification on 2026-05-10 confirmed F8 still surfaces "permission
-- denied for table talents" on the Admin Matches tab even after every
-- DB-side check passed:
--   * talents_all_admin (cmd=ALL using is_admin()) and talents_select_admin
--     (cmd=SELECT using is_admin()) both present
--   * authenticated has GRANT SELECT on talents (table + column level)
--   * is_admin() returns true under impersonation for both admin profiles
--   * The exact MatchPanel embed query succeeds under role=authenticated +
--     admin sub via the SQL editor
--   * Same query under role=anon produces the EXACT "permission denied for
--     table talents" wording — i.e. the live request is being treated as
--     anon, not authenticated, even though the same client + JWT is
--     successfully calling the get_admin_kpis() RPC milliseconds earlier
--
-- Conclusion: the bug is somewhere between supabase-js, PostgREST embeds,
-- and the auth-context plumbing — not in the DB. The cleanest fix that
-- mirrors the working pattern (KpiPanel via get_admin_kpis) is to expose a
-- SECURITY DEFINER RPC that runs the join inside the function body, gates
-- on is_admin() at the entry, and returns a flat row shape MatchPanel can
-- consume without any embed.
--
-- This migration parallels 0100_admin_kpis_rpc.sql in approach.
-- Idempotent. Safe to re-run.

create or replace function public.get_admin_matches(
  p_status text default null,
  p_limit int default 100
)
returns table (
  id                  uuid,
  status              text,
  compatibility_score numeric,
  tag_compatibility   numeric,
  life_chart_score    numeric,
  internal_reasoning  jsonb,
  created_at          timestamptz,
  expires_at          timestamptz,
  role_title          text,
  talent_id           uuid,
  talent_profile_id   uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  -- Admin-only entry; mirror is_admin()'s contract so non-admin callers get
  -- a clean 403 instead of an empty result that looks like "no matches".
  if not public.is_admin() then
    raise exception 'get_admin_matches: not authorized' using errcode = '42501';
  end if;

  -- Clamp limit so a fat-finger value can't load the whole table.
  if p_limit is null or p_limit <= 0 then p_limit := 100; end if;
  if p_limit > 500 then p_limit := 500; end if;

  return query
    select
      m.id,
      m.status,
      m.compatibility_score,
      m.tag_compatibility,
      m.life_chart_score,
      m.internal_reasoning,
      m.created_at,
      m.expires_at,
      r.title as role_title,
      t.id    as talent_id,
      t.profile_id as talent_profile_id
    from public.matches m
    left join public.roles   r on r.id = m.role_id
    left join public.talents t on t.id = m.talent_id
    where p_status is null or m.status = p_status
    order by m.created_at desc
    limit p_limit;
end;
$$;

revoke all on function public.get_admin_matches(text, int) from public;
grant execute on function public.get_admin_matches(text, int) to authenticated;

notify pgrst, 'reload schema';
