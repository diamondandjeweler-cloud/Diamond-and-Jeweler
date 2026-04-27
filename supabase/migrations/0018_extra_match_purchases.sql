-- Pay-per-extra-match (v4 §18). Additive schema — safe to apply on top of 0001–0017.
--
-- Model:
--   * Free quota per role: 3 active matches (enforced in match-generate).
--   * Paid extra matches: up to 3 per role (HM-side) and 3 per talent (talent-side).
--   * Payment: ToyyibPay (Malaysia). payment-webhook flips pending → paid, then
--     calls match-generate with is_extra_match=true to insert one extra match.

-- 1) Mark matches as free vs. paid-extra.
alter table public.matches
  add column if not exists is_extra_match boolean not null default false;

-- 2) Quota counters (hard-capped at 3 each, so the UI/edge functions cannot
--    silently over-charge a user even if the webhook is replayed).
alter table public.roles
  add column if not exists extra_matches_used integer not null default 0;
alter table public.roles
  drop constraint if exists roles_extra_matches_used_cap;
alter table public.roles
  add constraint roles_extra_matches_used_cap
  check (extra_matches_used between 0 and 3);

alter table public.talents
  add column if not exists extra_matches_used integer not null default 0;
alter table public.talents
  drop constraint if exists talents_extra_matches_used_cap;
alter table public.talents
  add constraint talents_extra_matches_used_cap
  check (extra_matches_used between 0 and 3);

-- 3) Purchase log. payment_intent_id holds the ToyyibPay billcode.
create table if not exists public.extra_match_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  talent_id uuid references public.talents(id) on delete set null,
  match_type text not null check (match_type in ('hm_extra','talent_extra')),
  quantity integer not null default 1 check (quantity between 1 and 3),
  amount_rm numeric(8,2) not null default 9.90,
  currency text not null default 'RM',
  payment_intent_id text unique,
  payment_provider text not null default 'toyyibpay',
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','failed','refunded','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- HM purchases must target a role; talent purchases must target a talent.
  constraint emp_target_matches_type check (
    (match_type = 'hm_extra'     and role_id   is not null) or
    (match_type = 'talent_extra' and talent_id is not null)
  )
);

create index if not exists idx_emp_user_id on public.extra_match_purchases(user_id);
create index if not exists idx_emp_role_id on public.extra_match_purchases(role_id);
create index if not exists idx_emp_talent_id on public.extra_match_purchases(talent_id);
create index if not exists idx_emp_status on public.extra_match_purchases(payment_status, created_at desc);

create trigger tg_extra_match_purchases_updated_at
  before update on public.extra_match_purchases
  for each row execute function public.tg_set_updated_at();

-- 4) RLS. Users see only their own purchases; admins see all. Writes are
--    performed server-side by Edge Functions (service_role bypasses RLS), so
--    we intentionally do NOT grant INSERT/UPDATE to authenticated.
alter table public.extra_match_purchases enable row level security;

drop policy if exists emp_select_self on public.extra_match_purchases;
create policy emp_select_self on public.extra_match_purchases
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists emp_admin_all on public.extra_match_purchases;
create policy emp_admin_all on public.extra_match_purchases
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 5) Price defaults in system_config. Edge functions read these so pricing can
--    be tuned without a redeploy.
insert into public.system_config (key, value) values
  ('extra_match_price_rm', '9.90'),
  ('extra_match_cap_per_role', '3'),
  ('extra_match_cap_per_talent', '3')
on conflict (key) do nothing;
