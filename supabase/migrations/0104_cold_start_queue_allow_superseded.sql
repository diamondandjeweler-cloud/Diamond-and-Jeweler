-- 0104 — extend cold_start_queue.status check to allow 'superseded' (F6 fix-up)
--
-- Migration 0102 introduced 'superseded' as the terminal state for rows
-- collapsed by the dedupe pass, but the CHECK constraint from 0001 only
-- allowed 'pending' / 'applied' / 'cancelled'. 0102's UPDATE therefore
-- failed mid-run on live and the partial unique index was never created.
--
-- Drop the old check, add one that includes 'superseded', then re-run
-- the 0102 dedupe + index steps (idempotent).

alter table public.cold_start_queue
  drop constraint if exists cold_start_queue_status_check;

alter table public.cold_start_queue
  add constraint cold_start_queue_status_check
  check (status in ('pending', 'applied', 'cancelled', 'superseded'));

-- Re-run 0102 step 1 now that the constraint accepts 'superseded'.
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

-- Re-run 0102 step 2 (idempotent — partial unique index on pending rows).
create unique index if not exists cold_start_queue_role_id_pending_uniq
  on public.cold_start_queue (role_id)
  where status = 'pending';

notify pgrst, 'reload schema';
