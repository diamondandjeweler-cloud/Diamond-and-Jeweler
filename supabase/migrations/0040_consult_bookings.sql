-- ============================================================
-- BoLe Platform — Paid consult bookings
--
-- Three tiers (quick/standard/deep). Prices are admin-editable via
-- system_config so admins can change them without redeploys. After
-- payment success the payment-webhook calls create-meeting and emails
-- the user a 1:1 video link.
-- ============================================================

create table if not exists public.consult_bookings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tier text not null check (tier in ('quick','standard','deep')),
  duration_minutes int not null check (duration_minutes between 5 and 120),
  price_rm numeric(7,2) not null check (price_rm >= 0),
  payment_provider text not null default 'toyyibpay',
  payment_ref text,
  payment_redirect_url text,
  paid_at timestamptz,
  scheduled_for timestamptz,
  video_url text,
  status text not null default 'pending'
    check (status in ('pending','paid','scheduled','completed','cancelled','refunded','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_consult_profile on public.consult_bookings(profile_id);
create index if not exists idx_consult_status on public.consult_bookings(status);
create index if not exists idx_consult_payment_ref on public.consult_bookings(payment_ref);

drop trigger if exists tg_consult_bookings_updated_at on public.consult_bookings;
create trigger tg_consult_bookings_updated_at before update on public.consult_bookings
  for each row execute function public.tg_set_updated_at();

alter table public.consult_bookings enable row level security;

drop policy if exists consult_select_own on public.consult_bookings;
create policy consult_select_own on public.consult_bookings
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists consult_insert_self on public.consult_bookings;
create policy consult_insert_self on public.consult_bookings
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists consult_update_admin on public.consult_bookings;
create policy consult_update_admin on public.consult_bookings
  for update to authenticated
  using (public.is_admin());

-- Admin-editable price + duration knobs. Admin UI wires to these keys.
-- Defaults are auspicious MY pricing anchors (8/88/168) — admin can override.
insert into public.system_config (key, value) values
  ('consult_price_quick',       '28'::jsonb),
  ('consult_price_standard',    '88'::jsonb),
  ('consult_price_deep',        '168'::jsonb),
  ('consult_minutes_quick',     '10'::jsonb),
  ('consult_minutes_standard',  '15'::jsonb),
  ('consult_minutes_deep',      '30'::jsonb),
  ('consult_label_quick',       '"Quick read"'::jsonb),
  ('consult_label_standard',    '"Standard"'::jsonb),
  ('consult_label_deep',        '"Deep dive"'::jsonb),
  ('consult_currency',          '"RM"'::jsonb),
  ('consult_admin_email',       '"diamondandjeweler@gmail.com"'::jsonb)
on conflict (key) do nothing;
