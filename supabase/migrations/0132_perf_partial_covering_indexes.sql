-- 0132 — Partial + covering indexes for hot-status filters (items 3, 8, 9)
--
-- Partial indexes: only index the fraction of rows matching a common filter.
-- A partial index on a 10k-row table with 20% matching rows is 5× smaller
-- than a full index and stays in buffer pool more easily.
--
-- Covering INCLUDE: columns in the INCLUDE clause are stored in index leaf
-- pages so PostgREST can satisfy the projection from the index alone,
-- skipping heap fetches (index-only scans).

-- ── talents ─────────────────────────────────────────────────────────────────

-- "Active talent" filter used by get_admin_kpis() and match-generate.
-- is_open_to_offers=true is typically ~30-50% of all talent rows.
CREATE INDEX IF NOT EXISTS idx_talents_open_to_offers
  ON public.talents (id)
  WHERE is_open_to_offers = true;

-- ── roles ────────────────────────────────────────────────────────────────────

-- get_admin_kpis + match-generate always filter status='active'.
CREATE INDEX IF NOT EXISTS idx_roles_active
  ON public.roles (id)
  WHERE status = 'active';

-- ── profiles ─────────────────────────────────────────────────────────────────

-- get_admin_kpis: count(*) WHERE is_banned = true.
CREATE INDEX IF NOT EXISTS idx_profiles_banned
  ON public.profiles (id)
  WHERE is_banned = true;

-- get_admin_kpis: count(*) WHERE ghost_score >= 3.
CREATE INDEX IF NOT EXISTS idx_profiles_ghost
  ON public.profiles (id)
  WHERE ghost_score >= 3;

-- ── matches — partial indexes by status ─────────────────────────────────────
-- Enables fast count(*) per status for get_admin_kpis (each status subset
-- is a small fraction of the total; partial index fits in L1/L2).

CREATE INDEX IF NOT EXISTS idx_matches_status_generated
  ON public.matches (id) WHERE status = 'generated';

CREATE INDEX IF NOT EXISTS idx_matches_status_active_band
  ON public.matches (talent_id, created_at DESC)
  WHERE status IN ('generated', 'viewed', 'accepted_by_talent', 'invited_by_manager',
                   'hr_scheduling', 'interview_scheduled', 'interview_completed', 'offer_made');

-- ── matches — covering indexes (replaces narrower 0110 indexes) ──────────────
-- INCLUDE'd columns let the TalentDashboard / HMDashboard queries satisfy
-- their full SELECT list from the index without heap fetches.

CREATE INDEX IF NOT EXISTS idx_matches_talent_status_cov
  ON public.matches (talent_id, status)
  INCLUDE (id, compatibility_score, expires_at, created_at, public_reasoning, application_summary);

CREATE INDEX IF NOT EXISTS idx_matches_role_status_cov
  ON public.matches (role_id, status)
  INCLUDE (id, talent_id, compatibility_score, created_at);

-- ── companies ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_companies_verified_pending
  ON public.companies (id)
  WHERE verified = false;

-- ── waitlist ─────────────────────────────────────────────────────────────────

-- get_admin_kpis: count(*) WHERE approved = false.
-- Only add if waitlist table exists (may not in all envs).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'waitlist') THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_waitlist_pending
        ON public.waitlist (id)
        WHERE approved = false
    ';
  END IF;
END $$;
