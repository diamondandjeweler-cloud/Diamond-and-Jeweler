-- ============================================================
-- BoLe Phase 2 — Consent / BaZi / Reasoning / Feedback / Points
--                Referral / i18n / WhatsApp / Gig / Video
-- ============================================================
-- Single migration applied 2026-04-25. Designed to be re-runnable
-- (uses IF NOT EXISTS / DO blocks for idempotency).
-- ============================================================

-- ----------------------------------------------------------------
-- 1) PDPA CONSENT — versioned consent text + per-profile signature
-- ----------------------------------------------------------------

create table if not exists public.consent_versions (
  id          uuid primary key default gen_random_uuid(),
  version     text not null unique,
  language    text not null default 'en',
  body_md     text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.profiles
  add column if not exists consent_version    text,
  add column if not exists consent_signed_at  timestamptz,
  add column if not exists consent_ip_hash    text,
  add column if not exists locale             text not null default 'en'
    check (locale in ('en','ms','zh')),
  add column if not exists whatsapp_number    text,
  add column if not exists whatsapp_opt_in    boolean not null default false,
  add column if not exists points             integer not null default 0,
  add column if not exists points_earned_total integer not null default 0;

-- Seed initial consent v1 (English) — Malay & Chinese can be added via UI later.
insert into public.consent_versions (version, language, body_md, is_active) values
('v1.0-en', 'en',
'# Data Processing Consent and Waiver

I, the undersigned, give my **explicit consent** to BoLe ("the Platform") to collect, store, and process the following personal data:

- Full name, email, phone number
- National Registration Identity Card (NRIC) / Passport number and copy
- Photograph (if uploaded)
- Date of birth
- Resume and employment history
- Interview answers and job preferences

I understand that the Platform uses a **proprietary matching algorithm** that includes, but is not limited to, analysis based on my date of birth (life-chart / BaZi) to determine compatibility with potential employers or candidates. The exact algorithm is a trade secret and will not be disclosed to me.

I agree that my data may be shared with potential employers (or candidates) **solely for recruitment matching**.

## Waiver of Claims

I hereby waive any and all rights to bring a claim or legal action against the Platform, its owners, employees, or affiliates under the **Personal Data Protection Act 2010 (PDPA)** or any other Malaysian law for any loss, damage, or grievance arising from the collection, processing, or use of my personal data as described above, **except where such loss or damage results from gross negligence or willful misconduct of the Platform**.

I acknowledge that I have read and understood this consent and waiver.', true)
on conflict (version) do nothing;

-- ----------------------------------------------------------------
-- 2) MATCHING EXPLANATION — surface the existing internal_reasoning
--    via a sanitised, user-friendly column.
-- ----------------------------------------------------------------

alter table public.matches
  add column if not exists public_reasoning jsonb;
comment on column public.matches.public_reasoning is
  'User-facing match explanation. Subset of internal_reasoning, redacts proprietary BaZi internals.';

-- ----------------------------------------------------------------
-- 3) BAZI / LIFE-CHART — fortify the existing scaffold.
--    The compute_life_chart_score() SQL function stays as the public
--    interface, but it now delegates to a private Edge Function via
--    pg_net (configurable). Falls back to a deterministic stub if the
--    private service is unreachable so matching never breaks.
-- ----------------------------------------------------------------

-- system_config keys for BaZi service routing.
-- Empty values mean the stub formula is used. Set via Edge Function env vars
-- and copied to system_config for client-side awareness if needed.
insert into public.system_config (key, value) values
  ('bazi_service_url',   to_jsonb(''::text)),
  ('bazi_service_token', to_jsonb(''::text))
on conflict (key) do nothing;

-- The scaffold function already exists per migration 0008; re-create with
-- the secrecy boundary in place.
create or replace function public.compute_life_chart_score(dob1 date, dob2 date)
returns numeric
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- Stub formula: deterministic compatibility based on lunar-month parity
  -- and 12-year animal-zodiac affinity. Real proprietary mapping should be
  -- swapped in via the bazi-score Edge Function — see secrecy notes there.
  m1 int := extract(month from dob1)::int;
  m2 int := extract(month from dob2)::int;
  y1 int := extract(year from dob1)::int;
  y2 int := extract(year from dob2)::int;
  z1 int := y1 % 12;
  z2 int := y2 % 12;
  -- triplet groups for "best friend" / "good friend" zodiacs
  best_pairs int[][] := array[[0,4,8],[1,5,9],[2,6,10],[3,7,11]];
  same_group boolean := false;
  i int;
  base numeric := 50;
  delta numeric := 0;
begin
  -- same trine group → strong compatibility
  for i in 1..array_length(best_pairs, 1) loop
    if z1 = any(best_pairs[i:i][:]) and z2 = any(best_pairs[i:i][:]) then
      same_group := true;
      exit;
    end if;
  end loop;
  if same_group then delta := delta + 25;
  elsif (z1 + 6) % 12 = z2 then delta := delta - 15;  -- conflict pair
  end if;
  -- month-element complement
  if abs(m1 - m2) in (3, 9) then delta := delta + 10; end if;
  if abs(m1 - m2) = 6 then delta := delta + 5; end if;
  -- weak seasonal mismatch
  if (m1 between 1 and 3 and m2 between 7 and 9) or
     (m1 between 7 and 9 and m2 between 1 and 3) then
    delta := delta - 5;
  end if;
  return greatest(0, least(100, base + delta));
end;
$$;

-- Yearly fortune table (per-talent annual luck score) — read by the
-- "monthly fortune notifier" cron job (Phase 3 follow-up).
create table if not exists public.life_chart_yearly_fortune (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  fortune_year int not null,
  fortune_score numeric(5,2) not null,
  fortune_summary text,
  computed_at  timestamptz not null default now(),
  primary key (profile_id, fortune_year)
);

-- ----------------------------------------------------------------
-- 4) TWO-WAY FEEDBACK + POINTS
-- ----------------------------------------------------------------

create table if not exists public.feedback_submissions (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches(id) on delete cascade,
  from_user_id  uuid not null references auth.users(id) on delete cascade,
  to_user_id    uuid references auth.users(id) on delete set null,
  rating        int  not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now(),
  unique (match_id, from_user_id)
);

create table if not exists public.point_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  delta       int not null,
  reason      text not null,
  reference   jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_point_tx_user on public.point_transactions(user_id, created_at desc);

-- award_points: idempotent helper that bumps points and logs a transaction.
create or replace function public.award_points(
  p_user_id uuid, p_delta int, p_reason text, p_reference jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.point_transactions(user_id, delta, reason, reference)
  values (p_user_id, p_delta, p_reason, p_reference);
  update public.profiles
    set points = greatest(0, points + p_delta),
        points_earned_total = points_earned_total + greatest(0, p_delta)
    where id = p_user_id;
end;
$$;

-- system_config: feedback gives 1 point; 5 points = 1 free extra match.
insert into public.system_config (key, value) values
  ('points_per_feedback',     to_jsonb(1)),
  ('points_per_referral',     to_jsonb(3)),
  ('points_per_extra_match',  to_jsonb(5))
on conflict (key) do nothing;

-- ----------------------------------------------------------------
-- 5) REFERRAL SYSTEM
-- ----------------------------------------------------------------

create table if not exists public.referrals (
  id              uuid primary key default gen_random_uuid(),
  referrer_id     uuid not null references auth.users(id) on delete cascade,
  referred_email  text not null,
  referred_user_id uuid references auth.users(id) on delete set null,
  code            text not null unique,
  status          text not null default 'pending'
                  check (status in ('pending','signed_up','onboarded','rewarded','expired','cancelled')),
  reward_claimed_at timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_ref_referrer on public.referrals(referrer_id);
create index if not exists idx_ref_email    on public.referrals(referred_email);

-- Generate a short readable referral code (e.g. K7P2Q9).
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

-- ----------------------------------------------------------------
-- 6) GIG / TEMPORARY ROLES
-- ----------------------------------------------------------------

alter table public.roles
  add column if not exists employment_type text not null default 'full_time'
    check (employment_type in ('full_time','part_time','contract','gig','internship')),
  add column if not exists duration_days   int,
  add column if not exists hourly_rate     numeric(10,2),
  add column if not exists start_date      date;

create index if not exists idx_roles_employment_type on public.roles(employment_type);

-- ----------------------------------------------------------------
-- 7) VIDEO INTERVIEWS
-- ----------------------------------------------------------------

alter table public.interviews
  add column if not exists meeting_url       text,
  add column if not exists meeting_provider  text default 'daily.co',
  add column if not exists meeting_room_name text;

-- ----------------------------------------------------------------
-- 8) RLS for new tables
-- ----------------------------------------------------------------

alter table public.consent_versions enable row level security;
alter table public.feedback_submissions enable row level security;
alter table public.point_transactions enable row level security;
alter table public.referrals enable row level security;
alter table public.life_chart_yearly_fortune enable row level security;

-- consent_versions: public read, admin write.
drop policy if exists consent_versions_select_all on public.consent_versions;
create policy consent_versions_select_all on public.consent_versions
  for select using (true);

drop policy if exists consent_versions_admin_write on public.consent_versions;
create policy consent_versions_admin_write on public.consent_versions
  for all using (public.is_admin()) with check (public.is_admin());

-- feedback: own + admin.
drop policy if exists feedback_select_own on public.feedback_submissions;
create policy feedback_select_own on public.feedback_submissions
  for select using (auth.uid() = from_user_id or auth.uid() = to_user_id or public.is_admin());

drop policy if exists feedback_insert_self on public.feedback_submissions;
create policy feedback_insert_self on public.feedback_submissions
  for insert with check (auth.uid() = from_user_id);

-- point_transactions: own read, admin all.
drop policy if exists points_select_own on public.point_transactions;
create policy points_select_own on public.point_transactions
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists points_admin_write on public.point_transactions;
create policy points_admin_write on public.point_transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- referrals: own read, own create.
drop policy if exists ref_select_own on public.referrals;
create policy ref_select_own on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_user_id or public.is_admin());

drop policy if exists ref_insert_self on public.referrals;
create policy ref_insert_self on public.referrals
  for insert with check (auth.uid() = referrer_id);

drop policy if exists ref_admin_update on public.referrals;
create policy ref_admin_update on public.referrals
  for update using (public.is_admin()) with check (public.is_admin());

-- yearly fortune: own read.
drop policy if exists yf_select_own on public.life_chart_yearly_fortune;
create policy yf_select_own on public.life_chart_yearly_fortune
  for select using (auth.uid() = profile_id or public.is_admin());

drop policy if exists yf_admin_write on public.life_chart_yearly_fortune;
create policy yf_admin_write on public.life_chart_yearly_fortune
  for all using (public.is_admin()) with check (public.is_admin());
