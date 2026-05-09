-- 0097 — admin force-match and refund support columns
--
-- The admin-force-match Edge Function inserts a match row that bypasses the
-- normal scoring pipeline; the admin-refund Edge Function flips a purchase
-- to 'refunded'. Both need a small audit trail so a future admin (or DSR)
-- can see who did what and why.

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

-- point_purchases: same shape (only if the table exists — older deployments
-- may not have it yet; the IF EXISTS guard keeps re-runs safe).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'point_purchases') then
    execute 'alter table public.point_purchases
      add column if not exists refunded_at timestamptz,
      add column if not exists refund_reason text,
      add column if not exists refunded_by uuid references public.profiles(id) on delete set null';
  end if;
end$$;

-- Allow status='refunded' on both purchase tables. Both currently constrain
-- status to a check list; the safe pattern is to drop+re-add. We use
-- IF EXISTS to make the migration idempotent.
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.extra_match_purchases'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.extra_match_purchases drop constraint if exists %I', c);
  end loop;
  alter table public.extra_match_purchases
    add constraint extra_match_purchases_status_check
    check (status in ('pending', 'paid', 'failed', 'refunded'));
exception when undefined_table then null;
end$$;

do $$
declare
  c text;
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'point_purchases') then
    for c in
      select conname from pg_constraint
      where conrelid = 'public.point_purchases'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%status%'
    loop
      execute format('alter table public.point_purchases drop constraint if exists %I', c);
    end loop;
    alter table public.point_purchases
      add constraint point_purchases_status_check
      check (status in ('pending', 'paid', 'failed', 'refunded'));
  end if;
end$$;
