-- ============================================================================
-- 0160 — Fix the every-2-minute admin-KPI refresh failure
--
-- BUG: 0134 created mv_admin_kpis with a UNIQUE INDEX on the CONSTANT expression
--   ((1)), intending to enable REFRESH ... CONCURRENTLY. Postgres requires the
--   unique index for CONCURRENTLY to be on actual MV COLUMN(s), not a constant
--   expression, so every refresh has errored:
--     "cannot refresh materialized view concurrently
--      HINT: Create a unique index with no WHERE clause on one or more columns".
--   The failing REFRESH is the FIRST statement in BOTH the pg_cron job and
--   refresh_admin_kpis_mv(), so the whole job aborts and the admin_kpi_cache
--   INSERT below it never runs either — every admin KPI (users, matches, funnel)
--   has been frozen at MV-creation values, and the cron has failed every 2 min.
--
-- FIX: drop CONCURRENTLY in both places. mv_admin_kpis is a single-row aggregate
--   over a small table — the refresh is sub-millisecond and get_admin_kpis_fast()
--   reads it with a trivial SELECT, so the brief ACCESS EXCLUSIVE lock of a plain
--   REFRESH is negligible (and the cache table read by the admin UI is a separate
--   relation). The ((1)) singleton index is harmless (still enforces one row), so
--   we leave it. Idempotent.
-- ============================================================================

-- ── Admin "Refresh" RPC: non-concurrent refresh ─────────────────────────────
create or replace function public.refresh_admin_kpis_mv()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'refresh_admin_kpis_mv: not authorized' using errcode = '42501';
  end if;

  -- Non-concurrent (0160): the ((1)) index from 0134 can't support CONCURRENTLY.
  refresh materialized view public.mv_admin_kpis;

  insert into public.admin_kpi_cache (
    id,
    total_users, banned_users, ghost_users,
    active_talents, active_roles,
    companies_verified, companies_pending,
    waitlist_pending, refreshed_at
  )
  select
    true,
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where is_banned = true),
    (select count(*) from public.profiles where ghost_score >= 3),
    (select count(*) from public.talents where is_open_to_offers = true),
    (select count(*) from public.roles where status = 'active'),
    (select count(*) from public.companies where verified = true),
    (select count(*) from public.companies where verified = false),
    (select count(*) from public.waitlist where approved = false),
    now()
  on conflict (id) do update set
    total_users        = excluded.total_users,
    banned_users       = excluded.banned_users,
    ghost_users        = excluded.ghost_users,
    active_talents     = excluded.active_talents,
    active_roles       = excluded.active_roles,
    companies_verified = excluded.companies_verified,
    companies_pending  = excluded.companies_pending,
    waitlist_pending   = excluded.waitlist_pending,
    refreshed_at       = excluded.refreshed_at;
end;
$$;

-- ── pg_cron job: re-schedule with non-concurrent refresh ────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-admin-kpis-mv') then
    perform cron.unschedule('refresh-admin-kpis-mv');
  end if;
end;
$$;

select cron.schedule(
  'refresh-admin-kpis-mv',
  '*/2 * * * *',
  $cron$
    refresh materialized view public.mv_admin_kpis;
    insert into public.admin_kpi_cache (
      id,
      total_users, banned_users, ghost_users,
      active_talents, active_roles,
      companies_verified, companies_pending,
      waitlist_pending, refreshed_at
    )
    select
      true,
      (select count(*) from public.profiles),
      (select count(*) from public.profiles where is_banned = true),
      (select count(*) from public.profiles where ghost_score >= 3),
      (select count(*) from public.talents where is_open_to_offers = true),
      (select count(*) from public.roles where status = 'active'),
      (select count(*) from public.companies where verified = true),
      (select count(*) from public.companies where verified = false),
      (select count(*) from public.waitlist where approved = false),
      now()
    on conflict (id) do update set
      total_users        = excluded.total_users,
      banned_users       = excluded.banned_users,
      ghost_users        = excluded.ghost_users,
      active_talents     = excluded.active_talents,
      active_roles       = excluded.active_roles,
      companies_verified = excluded.companies_verified,
      companies_pending  = excluded.companies_pending,
      waitlist_pending   = excluded.waitlist_pending,
      refreshed_at       = excluded.refreshed_at;
  $cron$
);

notify pgrst, 'reload schema';
