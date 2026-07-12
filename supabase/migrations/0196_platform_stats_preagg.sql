-- 0196_platform_stats_preagg.sql
-- ============================================================================
-- B8 — Pre-aggregated public counters for /api/stats (SocialProofStrip).
--
-- /api/stats currently runs two `count=exact` scans (profiles role~talent,
-- companies) on EVERY CDN cache-miss. The count=exact on profiles with a
-- leading-wildcard `role ilike '%talent%'` is a seq scan. This migration adds a
-- single-row cache table the API can read instead, refreshed on a cron.
--
-- /api/stats reads public.platform_stats via PostgREST (anon key) and FALLS
-- BACK to the live count when the row is missing (backward-compatible: applying
-- this migration is a pure win, and NOT applying it leaves the API on its
-- existing live-count path). See apps/web/api/stats.ts.
--
-- Only anonymised aggregate counts live here — the same integers the public
-- counter already exposes — so anon SELECT is safe. Writes are service_role
-- only (the refresh fn is SECURITY DEFINER). Idempotent.
-- ============================================================================

create extension if not exists pg_cron;

-- Single-row table (id is a constant true PK so upsert always targets one row).
create table if not exists public.platform_stats (
  id              boolean primary key default true,
  talents_count   integer not null default 0,
  companies_count integer not null default 0,
  updated_at      timestamptz not null default now(),
  constraint platform_stats_singleton check (id = true)
);

alter table public.platform_stats enable row level security;

-- Public read (aggregate counts only). Writes never come through PostgREST.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'platform_stats'
      and policyname = 'platform_stats_public_read'
  ) then
    create policy platform_stats_public_read on public.platform_stats
      for select to anon, authenticated using (true);
  end if;
end $$;

grant select on public.platform_stats to anon, authenticated;

-- ---- refresh_platform_stats() — recompute + upsert the singleton ----------
-- Mirrors the exact predicates /api/stats uses today:
--   talents   = profiles where role ILIKE '%talent%'
--   companies = all companies
create or replace function public.refresh_platform_stats()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_talents   integer;
  v_companies integer;
begin
  select count(*)::int into v_talents
    from public.profiles where role ilike '%talent%';
  select count(*)::int into v_companies
    from public.companies;

  insert into public.platform_stats (id, talents_count, companies_count, updated_at)
  values (true, v_talents, v_companies, now())
  on conflict (id) do update
    set talents_count   = excluded.talents_count,
        companies_count = excluded.companies_count,
        updated_at      = excluded.updated_at;
end;
$$;

revoke all on function public.refresh_platform_stats() from public;
grant execute on function public.refresh_platform_stats() to service_role;

-- Seed once so the row exists immediately on apply (the API can read it right away).
select public.refresh_platform_stats();

-- Refresh every 30 minutes (matches the API's CDN s-maxage=1800).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'bole-refresh-platform-stats-30m') then
    perform cron.unschedule('bole-refresh-platform-stats-30m');
  end if;
  perform cron.schedule(
    'bole-refresh-platform-stats-30m',
    '*/30 * * * *',
    $cron$select public.refresh_platform_stats();$cron$
  );
end $$;

comment on table public.platform_stats is
  'Pre-aggregated public counters for /api/stats. Refreshed every 30m by cron. Added by 0196 (B8).';
