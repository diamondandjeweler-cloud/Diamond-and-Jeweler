-- Match queue for batch processing of roles at scale (10k+ vacancies).
-- Real-time path (single HM posting a role) still calls match-generate directly.
-- Batch path: admin bulk-inserts roles → they land in this queue → processed
-- by the process-match-queue Edge Function (controlled concurrency, no burst).

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS match_queue (
  id          BIGSERIAL PRIMARY KEY,
  role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  priority    INT  NOT NULL DEFAULT 0,   -- higher = processed sooner
  retry_count INT  NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Only one pending/processing entry per role at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_queue_role_active
  ON match_queue (role_id)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_match_queue_pending
  ON match_queue (priority DESC, created_at)
  WHERE status = 'pending';

-- ── Atomic claim function (FOR UPDATE SKIP LOCKED — no double-processing) ────

CREATE OR REPLACE FUNCTION claim_match_queue_batch(p_batch_size INT DEFAULT 20)
RETURNS TABLE(id BIGINT, role_id UUID, retry_count INT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE match_queue q
  SET status     = 'processing',
      updated_at = now()
  WHERE q.id IN (
    SELECT inner_q.id
    FROM   match_queue inner_q
    WHERE  inner_q.status      = 'pending'
      AND  inner_q.retry_count < 3
    ORDER  BY inner_q.priority DESC, inner_q.created_at ASC
    LIMIT  p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING q.id, q.role_id, q.retry_count;
END;
$$;

-- ── Mark done ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION complete_match_queue_item(p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE match_queue
  SET status       = 'done',
      processed_at = now(),
      updated_at   = now()
  WHERE id = p_id;
END;
$$;

-- ── Mark failed ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fail_match_queue_item(p_id BIGINT, p_error TEXT, p_retry_count INT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE match_queue
  SET status      = CASE WHEN p_retry_count >= 2 THEN 'failed' ELSE 'pending' END,
      last_error  = p_error,
      retry_count = p_retry_count + 1,
      updated_at  = now()
  WHERE id = p_id;
END;
$$;

-- ── Reset stalled items (stuck in 'processing' > 30 min, e.g. after crash) ──

CREATE OR REPLACE FUNCTION reset_stalled_match_queue()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE match_queue
  SET status     = 'pending',
      updated_at = now()
  WHERE status     = 'processing'
    AND updated_at < now() - INTERVAL '30 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── Convenience: bulk-enqueue all active roles that have no existing matches ─
-- Run this once when you want to process your backlog of unmatched roles.

CREATE OR REPLACE FUNCTION enqueue_unmatched_roles(p_priority INT DEFAULT 0)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO match_queue (role_id, priority)
  SELECT r.id, p_priority
  FROM   roles r
  WHERE  r.status = 'active'
    AND  (r.vacancy_expires_at IS NULL OR r.vacancy_expires_at > now())
    -- exclude roles that already have active matches
    AND  NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE  m.role_id = r.id
        AND  m.status IN (
          'pending_approval','generated','viewed','accepted_by_talent',
          'invited_by_manager','hr_scheduling','interview_scheduled',
          'interview_completed','offer_made'
        )
    )
    -- exclude roles already in the queue (pending or processing)
    AND  NOT EXISTS (
      SELECT 1 FROM match_queue q
      WHERE  q.role_id = r.id
        AND  q.status IN ('pending','processing')
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── Monitoring view ───────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW match_queue_stats AS
SELECT
  status,
  COUNT(*)                                                         AS count,
  MIN(created_at)                                                  AS oldest,
  AVG(EXTRACT(EPOCH FROM (processed_at - created_at)))            AS avg_seconds,
  SUM(retry_count)                                                 AS total_retries,
  MAX(retry_count)                                                 AS max_retries
FROM match_queue
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY status;

-- ── Indexes to make match-core pre-filters fast at 100k talent scale ─────────
-- These support the two SQL pre-filters applied before any rows are transferred:
--   1. employment_type_preferences @> [role_type]  (GIN, array contains)
--   2. expected_salary_min <= role_salary_max       (btree)
-- Without these, both filters would do a full table scan on every match run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talents_open
  ON talents (is_open_to_offers, feedback_score DESC)
  WHERE is_open_to_offers = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talents_salary_min
  ON talents (expected_salary_min)
  WHERE is_open_to_offers = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_talents_emp_type
  ON talents USING GIN (employment_type_preferences)
  WHERE is_open_to_offers = true; -- partial: only active open-to-offers rows

-- ── RLS: only service role may read/write the queue ───────────────────────────

ALTER TABLE match_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY match_queue_service_only ON match_queue
  USING (auth.role() = 'service_role');
