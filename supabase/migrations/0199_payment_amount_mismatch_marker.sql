-- =============================================================================
-- 0199 — finance-review marker for signature-valid, amount-mismatched payments (B9)
-- =============================================================================
-- payment-webhook verifies the Billplz X-Signature (which authenticates every
-- field INCLUDING `amount`), then asserts the signed paid amount (sen) equals the
-- purchase's stored price before crediting. On a MISMATCH it refuses the credit
-- (fail-safe) and returns HTTP 200 so Billplz stops retrying — but the buyer may
-- have really been charged, and Billplz does not retry, so a silent 'pending' row
-- is invisible to finance. This adds a durable `amount_mismatch` marker (mirrors
-- the 0190 `match_undelivered` pattern) that payment-webhook now sets on the
-- mismatch branch so finance / an operator / a future reconciler can find and
-- reconcile or refund charged-but-not-credited buyers. It pairs with the
-- BILLPLZ_AMOUNT_MISMATCH reportError alert emitted at the same moment.
--
-- Additive + nullable-with-default; no backfill needed. Partial indexes support
-- the "find flagged" lookup. The edge fn writes this marker BEST-EFFORT (it
-- swallows the error if this migration has not been applied yet), so the fn is
-- backward-compatible either side of this migration.
--
-- ROLLBACK:
--   drop index if exists public.idx_emp_amount_mismatch;
--   drop index if exists public.idx_point_purch_amount_mismatch;
--   drop index if exists public.idx_consult_amount_mismatch;
--   alter table public.extra_match_purchases drop column if exists amount_mismatch;
--   alter table public.point_purchases       drop column if exists amount_mismatch;
--   alter table public.consult_bookings       drop column if exists amount_mismatch;
-- =============================================================================

begin;

-- 1) extra_match_purchases
alter table public.extra_match_purchases
  add column if not exists amount_mismatch boolean not null default false;

comment on column public.extra_match_purchases.amount_mismatch is
  'Set true by payment-webhook when a signature-VALID paid Billplz callback''s '
  'signed amount did not equal this purchase''s stored price (amount_rm). The '
  'credit is refused (fail-safe); the buyer may have been charged. Finance uses '
  'this to reconcile/refund. Pairs with the BILLPLZ_AMOUNT_MISMATCH alert.';

create index if not exists idx_emp_amount_mismatch
  on public.extra_match_purchases(created_at)
  where amount_mismatch = true;

-- 2) point_purchases
alter table public.point_purchases
  add column if not exists amount_mismatch boolean not null default false;

comment on column public.point_purchases.amount_mismatch is
  'Set true by payment-webhook when a signature-VALID paid Billplz callback''s '
  'signed amount did not equal this package''s stored price (amount_rm). The '
  'points credit is refused (fail-safe); the buyer may have been charged. Finance '
  'uses this to reconcile/refund. Pairs with the BILLPLZ_AMOUNT_MISMATCH alert.';

create index if not exists idx_point_purch_amount_mismatch
  on public.point_purchases(created_at)
  where amount_mismatch = true;

-- 3) consult_bookings
alter table public.consult_bookings
  add column if not exists amount_mismatch boolean not null default false;

comment on column public.consult_bookings.amount_mismatch is
  'Set true by payment-webhook when a signature-VALID paid Billplz callback''s '
  'signed amount did not equal this booking''s stored price (price_rm). The paid '
  'flip is refused (fail-safe); the buyer may have been charged. Finance uses '
  'this to reconcile/refund. Pairs with the BILLPLZ_AMOUNT_MISMATCH alert.';

create index if not exists idx_consult_amount_mismatch
  on public.consult_bookings(created_at)
  where amount_mismatch = true;

commit;
