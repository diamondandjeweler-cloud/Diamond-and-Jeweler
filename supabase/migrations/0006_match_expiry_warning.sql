-- ============================================================
-- BoLe Platform — Match expiry warnings (post-M4)
-- Track when the 24h-before-expiry warning email went out so we don't re-send.
-- ============================================================

alter table public.matches
  add column if not exists expiry_warning_sent_at timestamptz;

-- Partial index so the expiry-warning scanner hits the table cheaply.
create index if not exists idx_matches_warning_pending
  on public.matches (expires_at)
  where expiry_warning_sent_at is null
    and status in (
      'generated',
      'viewed',
      'accepted_by_talent',
      'invited_by_manager',
      'hr_scheduling'
    );
