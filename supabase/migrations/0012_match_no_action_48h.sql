-- ============================================================
-- BoLe Platform — 48h no-action reminder (v4 §14 notification matrix)
-- Matches a user views but doesn't act on within 48h get a reminder email.
-- Covers two cases:
--   • status = 'viewed'              → nudge the TALENT to accept/decline
--   • status = 'accepted_by_talent'  → nudge the HIRING MANAGER to invite
-- ============================================================

alter table public.matches
  add column if not exists reminder_48h_sent_at timestamptz;

-- Partial index so the reminder scanner in match-expire hits the table
-- cheaply (status = 'viewed' branch).
create index if not exists idx_matches_viewed_reminder_pending
  on public.matches (viewed_at)
  where reminder_48h_sent_at is null
    and status = 'viewed';

-- Same for the accepted-by-talent branch.
create index if not exists idx_matches_accepted_reminder_pending
  on public.matches (accepted_at)
  where reminder_48h_sent_at is null
    and status = 'accepted_by_talent';
