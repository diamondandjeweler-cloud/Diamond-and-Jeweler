-- 0097 — admin force-match and refund support columns
--
-- Adds the small audit trail columns the admin-force-match and admin-refund
-- Edge Functions write into. Both purchase tables already permit
-- payment_status='refunded' via their existing CHECK constraints, so this
-- migration just adds bookkeeping columns.

-- matches: who force-matched this pair, and why?
alter table public.matches
  add column if not exists is_force_match boolean not null default false,
  add column if not exists force_match_reason text,
  add column if not exists force_matched_by uuid references public.profiles(id) on delete set null;

create index if not exists matches_force_match_idx on public.matches (is_force_match) where is_force_match;

comment on column public.matches.is_force_match is
  'True iff this match was created by an admin via admin-force-match, bypassing the scoring pipeline.';

-- extra_match_purchases: refund metadata
alter table public.extra_match_purchases
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text,
  add column if not exists refunded_by uuid references public.profiles(id) on delete set null;

-- point_purchases: same shape
alter table public.point_purchases
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text,
  add column if not exists refunded_by uuid references public.profiles(id) on delete set null;
