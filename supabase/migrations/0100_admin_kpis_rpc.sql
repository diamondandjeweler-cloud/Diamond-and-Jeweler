-- 0100 — admin KPIs RPC (F1 fix)
--
-- Replaces KpiPanel's 14 parallel PostgREST head+count queries with a single
-- SECURITY DEFINER RPC that runs all aggregations in one DB round-trip.
--
-- Why: under load, the parallel head+count pattern on `matches` was returning
-- 503 across all 12 status filters even for admins whose `is_admin()` check
-- passes. RLS policy chain on matches (`matches_all_admin OR matches_select_hm
-- OR matches_select_hr OR matches_select_talent`) materializes nested EXISTS
-- joins on roles even when the admin branch short-circuits true; under 14
-- parallel HEAD requests, PostgREST/Supabase shed load with 503.
--
-- Consolidating into one SECURITY DEFINER function:
--   1. Bypasses RLS entirely (function runs as postgres) — no policy chain.
--   2. One round-trip instead of 14 — no parallel-request load shedding.
--   3. Admin-only entry: raise on non-admin caller via the is_admin() helper.

create or replace function public.get_admin_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  result jsonb;
  v_by_status jsonb;
  v_avg_hours_to_first_view numeric;
  v_hired bigint;
  v_completed bigint;
  v_interview_hire_rate numeric;
begin
  -- Admin-only entry. Mirror is_admin()'s contract so non-admins get a clean
  -- 403 rather than partial data.
  if not public.is_admin() then
    raise exception 'get_admin_kpis: not authorized' using errcode = '42501';
  end if;

  -- Match counts by status, aggregated in a single scan.
  select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) into v_by_status
  from (
    select status, count(*) as cnt
    from public.matches
    where status = any (array[
      'generated','viewed','accepted_by_talent','declined_by_talent',
      'invited_by_manager','declined_by_manager','hr_scheduling',
      'interview_scheduled','interview_completed','hired','expired'
    ])
    group by status
  ) s;

  -- Backfill any missing status keys with 0 so the client doesn't NaN on
  -- arithmetic over kpis.by_status['hired'] etc.
  v_by_status := v_by_status
    || jsonb_build_object(
      'generated',          coalesce((v_by_status->>'generated')::int, 0),
      'viewed',             coalesce((v_by_status->>'viewed')::int, 0),
      'accepted_by_talent', coalesce((v_by_status->>'accepted_by_talent')::int, 0),
      'declined_by_talent', coalesce((v_by_status->>'declined_by_talent')::int, 0),
      'invited_by_manager', coalesce((v_by_status->>'invited_by_manager')::int, 0),
      'declined_by_manager',coalesce((v_by_status->>'declined_by_manager')::int, 0),
      'hr_scheduling',      coalesce((v_by_status->>'hr_scheduling')::int, 0),
      'interview_scheduled',coalesce((v_by_status->>'interview_scheduled')::int, 0),
      'interview_completed',coalesce((v_by_status->>'interview_completed')::int, 0),
      'hired',              coalesce((v_by_status->>'hired')::int, 0),
      'expired',            coalesce((v_by_status->>'expired')::int, 0)
    );

  -- Avg time-to-first-view, last 200 viewed matches.
  select avg(extract(epoch from (viewed_at - created_at)) / 3600.0)::numeric
    into v_avg_hours_to_first_view
  from (
    select created_at, viewed_at
    from public.matches
    where viewed_at is not null
    order by viewed_at desc
    limit 200
  ) v;

  -- Interview → hire rate.
  v_hired     := (v_by_status->>'hired')::bigint;
  v_completed := (v_by_status->>'interview_completed')::bigint;
  v_interview_hire_rate := case when (v_hired + v_completed) > 0
    then v_hired::numeric / (v_hired + v_completed)::numeric
    else null end;

  -- Build the response object — single shape KpiPanel can consume directly.
  select jsonb_build_object(
    'total_matches',           (select count(*) from public.matches),
    'by_status',               v_by_status,
    'total_users',             (select count(*) from public.profiles),
    'banned_users',            (select count(*) from public.profiles where is_banned = true),
    'ghost_users',             (select count(*) from public.profiles where ghost_score >= 3),
    'active_talents',          (select count(*) from public.talents where is_open_to_offers = true),
    'active_roles',            (select count(*) from public.roles where status = 'active'),
    'companies_verified',      (select count(*) from public.companies where verified = true),
    'companies_pending',       (select count(*) from public.companies where verified = false),
    'waitlist_pending',        (select count(*) from public.waitlist where approved = false),
    'avg_hours_to_first_view', v_avg_hours_to_first_view,
    'interview_hire_rate',     v_interview_hire_rate
  ) into result;

  return result;
end;
$$;

-- Grant execute to authenticated. The body's is_admin() check enforces
-- the actual access boundary — non-admins get a 403 from the raise.
revoke all on function public.get_admin_kpis() from public;
grant execute on function public.get_admin_kpis() to authenticated;

-- Refresh PostgREST schema cache so the new RPC is reachable via /rest/v1/rpc.
notify pgrst, 'reload schema';
