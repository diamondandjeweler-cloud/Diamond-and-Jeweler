-- 0102 — cold_start_queue dedupe (F6)
--
-- F6: Admin → Cold start tab renders each queued role twice. Root cause:
-- match-generate enqueues a row each time it fails to find ≥3 matches for
-- a role, with no de-dup guard. The same role accumulates multiple
-- pending entries and the UI renders one card per row.
--
-- Fix in two parts:
--   1. Collapse existing duplicates: keep the oldest pending row per
--      role_id, mark the rest as 'superseded'.
--   2. Add a partial unique index on (role_id) where status='pending' so
--      future duplicate inserts fail fast and match-generate can ON
--      CONFLICT DO NOTHING.
--
-- The UI side keeps a defensive Map-based dedupe in ColdStartPanel so an
-- environment that hasn't run this migration yet still renders cleanly.

-- Step 1: collapse existing duplicates.
-- We use a CTE that ranks pending rows per role by created_at and keeps
-- only the oldest. Anything ranked > 1 gets 'superseded'.
with ranked as (
  select
    id,
    row_number() over (partition by role_id order by created_at asc, id asc) as rn
  from public.cold_start_queue
  where status = 'pending'
)
update public.cold_start_queue q
   set status = 'superseded'
  from ranked
 where q.id = ranked.id
   and ranked.rn > 1;

-- Step 2: enforce uniqueness going forward.
-- Partial unique index — only pending rows are unique by role_id. Once a
-- row transitions to 'applied' / 'superseded' / 'expired' it no longer
-- blocks a new pending insert for the same role.
create unique index if not exists cold_start_queue_role_id_pending_uniq
  on public.cold_start_queue (role_id)
  where status = 'pending';

-- Refresh PostgREST cache (no schema visible to clients changes, but the
-- planner will pick up the index immediately and the notify is cheap).
notify pgrst, 'reload schema';
