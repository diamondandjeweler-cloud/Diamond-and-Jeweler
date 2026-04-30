-- ============================================================
-- 0056 — Points hardening + Diamond Points package purchases.
--
-- 1) point_transactions.idempotency_key  (server-enforced uniqueness)
-- 2) award_points() overload that takes idempotency_key + returns awarded
-- 3) point_purchases table for Billplz package buys (RM -> points)
-- 4) Tighten referrals: index on (referred_email) for case-insensitive lookup
-- ============================================================

-- 1) Idempotency key on point_transactions.
alter table public.point_transactions
  add column if not exists idempotency_key text;

create unique index if not exists ux_point_tx_idempotency
  on public.point_transactions(user_id, idempotency_key)
  where idempotency_key is not null;

-- 2) New award_points signature with idempotency support.
--    Returns:
--      0  — already awarded (no-op)
--      n  — points awarded
--    Keeps the legacy 4-arg signature alive (referenced by older edge fns).
create or replace function public.award_points(
  p_user_id        uuid,
  p_delta          int,
  p_reason         text,
  p_reference      jsonb default '{}'::jsonb,
  p_idempotency_key text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
begin
  if p_idempotency_key is not null then
    select id into v_existing
      from public.point_transactions
     where user_id = p_user_id
       and idempotency_key = p_idempotency_key
     limit 1;
    if v_existing is not null then
      return 0;
    end if;
  end if;

  insert into public.point_transactions(user_id, delta, reason, reference, idempotency_key)
  values (p_user_id, p_delta, p_reason, p_reference, p_idempotency_key);

  update public.profiles
    set points = greatest(0, points + p_delta),
        points_earned_total = points_earned_total + greatest(0, p_delta)
    where id = p_user_id;

  return p_delta;
end;
$$;

-- 3) point_purchases — Billplz checkout for a Diamond Points package.
create table if not exists public.point_purchases (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  package_id         text not null,
  package_name       text not null,
  amount_rm          numeric(8,2) not null check (amount_rm > 0),
  points             int not null check (points > 0),
  currency           text not null default 'RM',
  payment_intent_id  text unique,
  payment_provider   text not null default 'billplz',
  payment_status     text not null default 'pending'
    check (payment_status in ('pending','paid','failed','refunded','cancelled')),
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_point_purch_user
  on public.point_purchases(user_id, created_at desc);
create index if not exists idx_point_purch_status
  on public.point_purchases(payment_status, created_at desc);

drop trigger if exists tg_point_purchases_updated_at on public.point_purchases;
create trigger tg_point_purchases_updated_at
  before update on public.point_purchases
  for each row execute function public.tg_set_updated_at();

alter table public.point_purchases enable row level security;

drop policy if exists pp_select_self on public.point_purchases;
create policy pp_select_self on public.point_purchases
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists pp_admin_all on public.point_purchases;
create policy pp_admin_all on public.point_purchases
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 4) Case-insensitive index for per-invite referral email matching.
create index if not exists idx_referrals_email_lower
  on public.referrals (lower(referred_email));

-- 5) Default packages (idempotent — only inserted if missing).
insert into public.system_config (key, value) values
  ('points_packages', to_jsonb('[
    {"id":"starter","name":"Starter","price_rm":39,"points":169},
    {"id":"value","name":"Value","price_rm":99,"points":499},
    {"id":"pro","name":"Pro","price_rm":199,"points":1099}
  ]'::jsonb))
on conflict (key) do nothing;
