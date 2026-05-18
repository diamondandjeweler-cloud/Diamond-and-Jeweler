-- 0123_perf_indexes_2.sql
--
-- Second round of performance indexes targeting the most frequent slow paths:
--
-- 1. notifications: every logged-in user fires a query on page load via NotificationBell.
--    RLS implicitly filters user_id; we add (user_id, channel, sent_at) so Postgres
--    can satisfy the eq(channel) + order(sent_at DESC) from the index alone.
--
-- 2. matches: MatchApprovalPanel does a status-only filter with no role/talent anchor.
--    The existing (role_id, status) and (talent_id, status) composites don't help here.
--    A partial index on the small pending_approval subset is fast and stays tiny.
--
-- 3. hiring_managers: looked up by user_id on every HM page load (session bootstrap).
--    user_id is already UNIQUE but explicit index makes the planner cost obvious.

CREATE INDEX IF NOT EXISTS idx_notifications_user_channel_sent
  ON public.notifications (user_id, channel, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_matches_pending_approval
  ON public.matches (created_at DESC)
  WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_hiring_managers_profile_id
  ON public.hiring_managers (profile_id);
