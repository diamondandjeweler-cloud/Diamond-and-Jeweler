-- =============================================================================
-- 0177 — link a delivered extra match back to its purchase (AUDIT #6)  (2026-07-10)
-- =============================================================================
-- When an hm_extra purchase is paid, payment-webhook fires match-generate with
-- is_extra_match=true, which inserts one paid match for the role. admin-refund
-- can refund the money and claw back points, but it has no way to find the
-- delivered match, so a refunded buyer keeps the paid match (audit #6).
--
-- FIX: add matches.source_purchase_id, stamped by match-core when the generation
-- was triggered by a purchase (threaded payment-webhook → match-generate →
-- match-core). admin-refund then expires the linked match on refund — but only
-- while it is still un-acted (pending_approval / generated / viewed); if the HM
-- or talent has already engaged (invited/scheduling/interview/offer/hired) it is
-- left in place and finance is warned, so a refund never yanks a live interview.
--
-- ON DELETE SET NULL: deleting a purchase row must not cascade-delete match
-- history. Additive + nullable — existing rows get NULL, existing inserts (free
-- matches) keep passing NULL. Partial index supports the refund lookup only.
--
-- ROLLBACK:
--   drop index if exists public.idx_matches_source_purchase;
--   alter table public.matches drop column if exists source_purchase_id;
-- =============================================================================

begin;

alter table public.matches
  add column if not exists source_purchase_id uuid
    references public.extra_match_purchases(id) on delete set null;

comment on column public.matches.source_purchase_id is
  'The extra_match_purchases row that paid for this match (hm_extra only); NULL '
  'for free/organic matches. Lets admin-refund expire the delivered paid match.';

create index if not exists idx_matches_source_purchase
  on public.matches(source_purchase_id)
  where source_purchase_id is not null;

commit;
