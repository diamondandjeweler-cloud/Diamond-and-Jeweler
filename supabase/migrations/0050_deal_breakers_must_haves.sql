-- Migration 0050: Deal-breakers (talent) + Must-haves (hiring manager) + passport photo

-- ── talents ──────────────────────────────────────────────────────────────────
alter table public.talents
  add column if not exists deal_breakers       jsonb    default '{}'::jsonb,
  add column if not exists photo_url           text,
  add column if not exists has_driving_license boolean,
  add column if not exists highest_qualification text
    check (highest_qualification in ('none','spm','diploma','degree','masters','phd'));

comment on column public.talents.deal_breakers is
  'Hard limits: {min_salary, no_work_days[], okay_with_after_hours}';
comment on column public.talents.photo_url is
  'Passport-size photo storage path in talent-photos bucket';
comment on column public.talents.has_driving_license is
  'Whether talent holds a valid driving licence';
comment on column public.talents.highest_qualification is
  'Highest academic qualification attained';

-- ── hiring_managers ───────────────────────────────────────────────────────────
alter table public.hiring_managers
  add column if not exists must_haves jsonb default '{}'::jsonb;

comment on column public.hiring_managers.must_haves is
  'Non-negotiable candidate requirements: {after_hours_contact, driving_license, min_qualification}';

-- ── roles ─────────────────────────────────────────────────────────────────────
alter table public.roles
  add column if not exists requires_weekend boolean not null default false;

comment on column public.roles.requires_weekend is
  'True if role requires working on Saturdays or Sundays';
