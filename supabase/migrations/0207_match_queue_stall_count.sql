-- =============================================================================
-- 0207 — match_queue poison-pill guard: stall_count (finding matcher-3)  (2026-07-13)
-- =============================================================================
-- process-match-queue calls reset_stalled_match_queue() every invocation to
-- recover items stuck in 'processing' > 30 min after a hard worker kill (edge
-- wall-clock/CPU/OOM on a 500-candidate role, host crash, or a deploy caught an
-- in-flight row). 0074's reset flips such rows back to 'pending' but leaves
-- retry_count UNTOUCHED. retry_count is only ever incremented by
-- fail_match_queue_item, which runs solely from the process-match-queue catch
-- block — a hard termination bypasses the catch entirely. So a role that
-- reliably kills the worker is reset → re-claimed → re-killed every ~30 min
-- FOREVER: it never reaches the retry_count>=3 'failed' cap, never surfaces via
-- the failed/pipeline_health path, and burns compute (plus head-of-line
-- amplification of its co-claimed batch) indefinitely.
--
-- FIX: a dedicated stall_count column (NOT retry_count — a benign infra restart
-- is not a scoring failure and must not burn the 3-try scoring budget of an
-- otherwise-healthy role). reset_stalled_match_queue increments stall_count on
-- each reset and, once it crosses the threshold, parks the row as 'failed' with
-- a diagnostic last_error instead of re-queueing it — so a poison role finally
-- surfaces through the same failed/pipeline_health path that fail_match_queue_item
-- feeds. claim_match_queue_batch also excludes stall_count>=cap rows as
-- belt-and-braces.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE. Signatures of both
-- functions are unchanged, so the process-match-queue caller is unaffected
-- (claim still returns id, role_id, retry_count).
--
-- ROLLBACK:
--   -- restore the 0074 definitions of the two functions, then:
--   alter table public.match_queue drop column if exists stall_count;
-- =============================================================================

begin;

-- Number of times a claimed item was found stalled in 'processing' and recovered
-- by reset_stalled_match_queue. Distinct from retry_count (caught scoring
-- failures) so a hard worker-kill loop can be capped without penalising healthy
-- roles that merely rode out an infra restart.
alter table public.match_queue
  add column if not exists stall_count int not null default 0;

-- ── Reset stalled items — now counts stalls and parks poison rows ────────────
-- Threshold 3: a role is given 3 stall-recovery attempts, then retired to
-- 'failed' (surfaced via pipeline_health) instead of looping indefinitely.
create or replace function reset_stalled_match_queue()
returns int language plpgsql as $$
declare
  v_count int;
begin
  update match_queue
  set stall_count  = stall_count + 1,
      status       = case when stall_count + 1 >= 3 then 'failed' else 'pending' end,
      last_error   = case when stall_count + 1 >= 3
                          then 'stalled: worker killed mid-run '
                               || (stall_count + 1) || ' times (poison role parked)'
                          else last_error end,
      processed_at = case when stall_count + 1 >= 3 then now() else processed_at end,
      updated_at   = now()
  WHERE status     = 'processing'
    AND updated_at < now() - INTERVAL '30 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
end;
$$;

-- ── Atomic claim — also exclude items that have exhausted their stall budget ──
-- (Parked poison rows are already status='failed' so the status='pending' filter
--  excludes them; the stall_count<3 guard is defense-in-depth against any
--  'pending' row that somehow accrued a high stall_count.)
create or replace function claim_match_queue_batch(p_batch_size int default 20)
returns table(id bigint, role_id uuid, retry_count int)
language plpgsql as $$
begin
  return query
  update match_queue q
  set status     = 'processing',
      updated_at = now()
  where q.id in (
    select inner_q.id
    from   match_queue inner_q
    where  inner_q.status      = 'pending'
      and  inner_q.retry_count < 3
      and  inner_q.stall_count < 3
    order  by inner_q.priority desc, inner_q.created_at asc
    limit  p_batch_size
    for update skip locked
  )
  returning q.id, q.role_id, q.retry_count;
end;
$$;

commit;
