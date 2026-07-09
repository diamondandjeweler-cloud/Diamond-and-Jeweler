-- =============================================================================
-- 0174 — IC-retention anchor: talents.ic_verified_at  (2026-07-09)
-- =============================================================================
-- data-retention purges IC scans "30 days after ic_verified=true" (its docstring)
-- but keyed the window off talents.updated_at — which tg_set_updated_at bumps on
-- EVERY row edit (is_open_to_offers toggle, profile change, …). So an active
-- talent's national-ID scan is retained far past the 30-day window: a PDPA
-- over-retention of a high-sensitivity document. There was no verification-time
-- column to anchor on (verified_at at 0001 belongs to `companies`, not talents).
--
-- Fix: add ic_verified_at, stamp it on the transition ic_verified→true (trigger),
-- backfill existing verified rows (else a NULL anchor makes them never purge, since
-- `NULL < cutoff` is false), and repoint the data-retention purge query at it
-- (supabase/functions/data-retention/index.ts).
--
-- Additive + idempotent. Applied live via the Management API; checked in as the
-- source-of-truth migration.
--
-- ROLLBACK: drop trigger trg_stamp_ic_verified_at + function stamp_ic_verified_at;
-- the column may be left in place (additive) and the retention query reverted.
-- =============================================================================

begin;

alter table public.talents add column if not exists ic_verified_at timestamptz;

-- Backfill already-verified rows so they stay purgeable. updated_at is the best
-- proxy available for the historical verification time.
update public.talents
   set ic_verified_at = coalesce(ic_verified_at, updated_at)
 where ic_verified is true and ic_verified_at is null;

create or replace function public.stamp_ic_verified_at()
returns trigger language plpgsql as $$
begin
  -- Stamp the verification time only on the transition to verified; never clear it.
  -- On INSERT, OLD is a NULL record so `old.ic_verified is distinct from true` is
  -- true, correctly stamping a row inserted already-verified.
  if new.ic_verified is true and (old.ic_verified is distinct from true) then
    new.ic_verified_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_ic_verified_at on public.talents;
create trigger trg_stamp_ic_verified_at
  before insert or update on public.talents
  for each row execute function public.stamp_ic_verified_at();

comment on column public.talents.ic_verified_at is
  'Timestamp ic_verified last flipped true. Anchors the IC-retention purge window '
  '(data-retention) so an unrelated profile edit does not reset the 30-day clock.';

commit;
