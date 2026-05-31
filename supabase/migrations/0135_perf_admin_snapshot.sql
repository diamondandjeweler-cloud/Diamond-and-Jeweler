-- 0135 — Daily admin snapshot table (item 10)
--
-- Stores a daily point-in-time aggregate so admins can see trends over time
-- without running expensive historical queries against live tables.
-- pg_cron writes one row at 23:00 UTC every night (07:00 MYT).
-- Data is retained for 365 days; older rows are pruned automatically.

CREATE TABLE IF NOT EXISTS public.admin_daily_snapshot (
  id          bigserial PRIMARY KEY,
  snapshot_date date NOT NULL,

  -- Platform counts
  total_users        bigint NOT NULL DEFAULT 0,
  total_talents      bigint NOT NULL DEFAULT 0,
  total_hm           bigint NOT NULL DEFAULT 0,
  total_hr           bigint NOT NULL DEFAULT 0,
  open_talents       bigint NOT NULL DEFAULT 0,
  active_roles       bigint NOT NULL DEFAULT 0,
  verified_companies bigint NOT NULL DEFAULT 0,

  -- Match funnel
  total_matches      bigint NOT NULL DEFAULT 0,
  matches_generated  bigint NOT NULL DEFAULT 0,
  matches_hired      bigint NOT NULL DEFAULT 0,
  matches_expired    bigint NOT NULL DEFAULT 0,

  -- Revenue proxies
  extra_match_purchases bigint NOT NULL DEFAULT 0,
  urgent_priority_reqs  bigint NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_admin_snapshot_date
  ON public.admin_daily_snapshot (snapshot_date DESC);

ALTER TABLE public.admin_daily_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY ads_admin_all ON public.admin_daily_snapshot
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Snapshot function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.take_admin_daily_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.admin_daily_snapshot (
    snapshot_date,
    total_users, total_talents, total_hm, total_hr,
    open_talents, active_roles, verified_companies,
    total_matches, matches_generated, matches_hired, matches_expired,
    extra_match_purchases, urgent_priority_reqs
  )
  SELECT
    current_date,
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.profiles WHERE role = 'talent'),
    (SELECT count(*) FROM public.profiles WHERE role = 'hiring_manager'),
    (SELECT count(*) FROM public.profiles WHERE role = 'hr_admin'),
    (SELECT count(*) FROM public.talents WHERE is_open_to_offers = true),
    (SELECT count(*) FROM public.roles   WHERE status = 'active'),
    (SELECT count(*) FROM public.companies WHERE verified = true),
    (SELECT count(*) FROM public.matches),
    (SELECT count(*) FROM public.matches WHERE status = 'generated'),
    (SELECT count(*) FROM public.matches WHERE status = 'hired'),
    (SELECT count(*) FROM public.matches WHERE status = 'expired'),
    (SELECT count(*) FROM public.extra_match_purchases),
    (SELECT count(*) FROM public.urgent_priority_requests)
  ON CONFLICT (snapshot_date) DO UPDATE SET
    total_users            = EXCLUDED.total_users,
    total_talents          = EXCLUDED.total_talents,
    total_hm               = EXCLUDED.total_hm,
    total_hr               = EXCLUDED.total_hr,
    open_talents           = EXCLUDED.open_talents,
    active_roles           = EXCLUDED.active_roles,
    verified_companies     = EXCLUDED.verified_companies,
    total_matches          = EXCLUDED.total_matches,
    matches_generated      = EXCLUDED.matches_generated,
    matches_hired          = EXCLUDED.matches_hired,
    matches_expired        = EXCLUDED.matches_expired,
    extra_match_purchases  = EXCLUDED.extra_match_purchases,
    urgent_priority_reqs   = EXCLUDED.urgent_priority_reqs,
    created_at             = now();

  -- Prune rows older than 365 days.
  DELETE FROM public.admin_daily_snapshot
  WHERE snapshot_date < current_date - INTERVAL '365 days';
END;
$$;

-- ── pg_cron: nightly at 23:00 UTC (07:00 MYT) ───────────────────────────────

SELECT cron.schedule(
  'admin-daily-snapshot',
  '0 23 * * *',
  'SELECT public.take_admin_daily_snapshot()'
);

NOTIFY pgrst, 'reload schema';
