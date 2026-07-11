-- =============================================================================
-- 0190 — durable marker for undelivered paid extra matches  (P1)  (2026-07-11)
-- =============================================================================
-- payment-webhook fired match-generate fire-and-forget (.catch(()=>{})) for a
-- paid hm_extra purchase, AFTER the money CAS committed and the quota counter
-- incremented. If generation failed the buyer was charged (and their quota
-- burned) with no match and no record — and Billplz is not idempotent, so there
-- is no retry. This adds a marker column that payment-webhook now sets when the
-- awaited match-generate call fails or returns matches_added<1, so admin-refund /
-- an operator / a future reconciler can find and re-drive undelivered purchases.
--
-- Additive + nullable-with-default; no backfill needed. Partial index supports
-- the "find undelivered" lookup. ROLLBACK:
--   drop index if exists public.idx_extra_match_purchases_undelivered;
--   alter table public.extra_match_purchases drop column if exists match_undelivered;
-- =============================================================================

begin;

alter table public.extra_match_purchases
  add column if not exists match_undelivered boolean not null default false;

comment on column public.extra_match_purchases.match_undelivered is
  'Set true by payment-webhook when the awaited match-generate for this PAID '
  'extra-match failed or delivered 0 matches — the buyer was charged but not '
  'fulfilled. Operators/admin-refund use it to re-drive or refund.';

create index if not exists idx_extra_match_purchases_undelivered
  on public.extra_match_purchases(created_at)
  where match_undelivered = true;

commit;
