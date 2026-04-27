-- ============================================================
-- BoLe Platform — Schema (Milestone 1)
-- Tables, indexes, auto-profile trigger, updated_at triggers.
-- Run this FIRST, before any other migration.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------- Generic updated_at trigger ----------

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- profiles (extends auth.users) ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  phone text,
  role text not null default 'talent'
    check (role in ('talent','hiring_manager','hr_admin','admin')),
  consents jsonb not null default '{}'::jsonb,
  is_banned boolean not null default false,
  ghost_score integer not null default 0,
  onboarding_complete boolean not null default false,
  waitlist_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_profiles_role on public.profiles(role);
create index idx_profiles_email on public.profiles(email);
create trigger tg_profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- Auto-create a profile row when an auth user is created.
-- full_name and role come from raw_user_meta_data set at signUp time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, consents)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'talent'),
    coalesce(new.raw_user_meta_data->'consents', '{}'::jsonb)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- companies ----------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration_number text unique not null,
  business_license_path text,
  website text,
  size text,
  industry text,
  primary_hr_email text not null,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_companies_hr_email on public.companies(primary_hr_email);
create index idx_companies_verified on public.companies(verified);
create trigger tg_companies_updated_at before update on public.companies
  for each row execute function public.tg_set_updated_at();

-- ---------- hiring_managers ----------

create table public.hiring_managers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  job_title text not null,
  date_of_birth_encrypted bytea,
  leadership_answers jsonb,
  leadership_tags jsonb,
  created_at timestamptz not null default now()
);
create index idx_hm_company on public.hiring_managers(company_id);

-- ---------- talents ----------

create table public.talents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique not null references public.profiles(id) on delete cascade,
  date_of_birth_encrypted bytea,
  ic_path text,
  ic_verified boolean not null default false,
  ic_purged_at timestamptz,
  resume_path text,
  parsed_resume jsonb,
  privacy_mode text not null default 'public'
    check (privacy_mode in ('public','anonymous','whitelist')),
  whitelist_companies uuid[] not null default array[]::uuid[],
  expected_salary_min integer,
  expected_salary_max integer,
  is_open_to_offers boolean not null default true,
  interview_answers jsonb,
  preference_ratings jsonb,
  derived_tags jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_talents_profile on public.talents(profile_id);
create index idx_talents_open on public.talents(is_open_to_offers) where is_open_to_offers;
create trigger tg_talents_updated_at before update on public.talents
  for each row execute function public.tg_set_updated_at();

-- ---------- roles (job postings) ----------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  hiring_manager_id uuid not null references public.hiring_managers(id) on delete cascade,
  title text not null,
  description text,
  department text,
  location text,
  work_arrangement text check (work_arrangement in ('remote','hybrid','onsite')),
  experience_level text check (experience_level in ('entry','junior','mid','senior','lead')),
  salary_min integer,
  salary_max integer,
  required_traits text[] not null default array[]::text[],
  status text not null default 'active'
    check (status in ('active','paused','filled','expired')),
  market_rate_check jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_roles_hm on public.roles(hiring_manager_id);
create index idx_roles_status on public.roles(status);
create trigger tg_roles_updated_at before update on public.roles
  for each row execute function public.tg_set_updated_at();

-- ---------- matches ----------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  talent_id uuid not null references public.talents(id) on delete cascade,
  compatibility_score numeric(5,2),
  tag_compatibility numeric(5,2),
  life_chart_score numeric(5,2),
  internal_reasoning jsonb,
  status text not null default 'generated' check (status in (
    'generated','viewed','accepted_by_talent','declined_by_talent',
    'invited_by_manager','declined_by_manager','hr_scheduling',
    'interview_scheduled','interview_completed','offer_made',
    'hired','expired'
  )),
  viewed_at timestamptz,
  accepted_at timestamptz,
  invited_at timestamptz,
  expires_at timestamptz,
  refresh_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_id, talent_id)
);
create index idx_matches_role on public.matches(role_id);
create index idx_matches_talent on public.matches(talent_id);
create index idx_matches_status_expires on public.matches(status, expires_at);
create trigger tg_matches_updated_at before update on public.matches
  for each row execute function public.tg_set_updated_at();

-- ---------- match_history (audit) ----------

create table public.match_history (
  id uuid primary key default gen_random_uuid(),
  role_id uuid references public.roles(id) on delete set null,
  talent_id uuid references public.talents(id) on delete set null,
  action text not null check (action in (
    'generated','refreshed_by_manager','refreshed_by_talent','expired_auto','manual_admin'
  )),
  previous_match_id uuid,
  created_at timestamptz not null default now()
);
create index idx_match_history_role on public.match_history(role_id);

-- ---------- interviews ----------

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  scheduled_at timestamptz,
  format text check (format in ('video','phone','in_person')),
  status text not null default 'pending_hr' check (status in (
    'pending_hr','scheduled','confirmed','completed','cancelled','no_show'
  )),
  notes text,
  feedback_talent integer check (feedback_talent between 1 and 5),
  feedback_manager integer check (feedback_manager between 1 and 5),
  created_at timestamptz not null default now()
);
create index idx_interviews_match on public.interviews(match_id);

-- ---------- notifications ----------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  channel text check (channel in ('email','in_app')),
  subject text,
  body text,
  data jsonb,
  read boolean not null default false,
  sent_at timestamptz not null default now()
);
create index idx_notifications_user_unread on public.notifications(user_id, read) where read = false;

-- ---------- tag_dictionary & user_tags ----------

create table public.tag_dictionary (
  id uuid primary key default gen_random_uuid(),
  tag_name text unique not null,
  category text check (category in ('boss_expectation','talent_expectation','behavioural')),
  weight_multiplier numeric(3,2) not null default 1.0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tag_name text not null references public.tag_dictionary(tag_name) on update cascade,
  score numeric(4,3),
  source text,
  created_at timestamptz not null default now()
);
create index idx_user_tags_user on public.user_tags(user_id);

-- ---------- admin audit & config ----------

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action_type text not null,
  target_type text,
  target_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index idx_admin_actions_admin on public.admin_actions(admin_id, created_at desc);

create table public.system_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger tg_system_config_updated_at before update on public.system_config
  for each row execute function public.tg_set_updated_at();

create table public.market_rate_cache (
  id uuid primary key default gen_random_uuid(),
  job_title text not null,
  location text,
  experience_level text,
  min_salary integer,
  max_salary integer,
  median_salary integer,
  currency text not null default 'RM',
  snapshot_date date not null default current_date
);

create table public.cold_start_queue (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  talent_ids uuid[] not null default array[]::uuid[],
  status text not null default 'pending'
    check (status in ('pending','applied','cancelled')),
  created_at timestamptz not null default now()
);

-- ---------- PDPA: data subject requests (DSR) ----------

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null
    check (request_type in ('access','correction','deletion','portability')),
  status text not null default 'pending'
    check (status in ('pending','in_review','completed','rejected')),
  notes text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index idx_data_requests_status on public.data_requests(status, created_at);

-- ---------- waitlist (pilot / invite-only phase) ----------

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  intended_role text check (intended_role in ('talent','hr_admin')),
  note text,
  approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- life-chart tables (Phase 2 placeholders) ----------

create table public.life_chart_base (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  gender text check (gender in ('male','female')),
  base_number integer not null,
  created_at timestamptz not null default now()
);

create table public.life_chart_adjustments (
  id uuid primary key default gen_random_uuid(),
  month integer check (month between 1 and 12),
  day_from integer check (day_from between 1 and 31),
  day_to integer check (day_to between 1 and 31),
  gender text check (gender in ('male','female')),
  adjustment integer not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.life_chart_cache (
  id uuid primary key default gen_random_uuid(),
  dob1 date not null,
  dob2 date not null,
  score numeric(5,2) not null,
  computed_at timestamptz not null default now(),
  unique (dob1, dob2)
);
