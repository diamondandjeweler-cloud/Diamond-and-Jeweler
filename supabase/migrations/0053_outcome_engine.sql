-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0053 — Outcome Engine
--
-- Philosophy: "Match for Outcome, not for Compatibility."
--
-- Adds:
--   • diamond_points balance on profiles
--   • Multi-stage feedback events (both HM→talent and talent→HM)
--   • match_lifecycle timeline (tracks real employment journey)
--   • match_outcomes log (actual hire events feeding PHS calibration)
--   • Talent PHS rates + reputation fields
--   • HM reputation fields
--   • Diamond Points stage helper function
-- ════════════════════════════════════════════════════════════════════════════

-- ── Profiles: Diamond Points balance ─────────────────────────────────────────
alter table profiles
  add column if not exists diamond_points int not null default 0;

-- ── Extend existing match_feedback (HM→talent, backward-compatible) ──────────
alter table match_feedback
  add column if not exists free_text             text,
  add column if not exists outcome               text,
  add column if not exists feedback_tags         jsonb,
  add column if not exists diamond_points_awarded int not null default 0;

-- ── Multi-stage feedback events (both parties, all lifecycle stages) ──────────
create table if not exists match_feedback_events (
  id         uuid        primary key default gen_random_uuid(),
  match_id   uuid        not null references matches(id) on delete cascade,
  stage      text        not null check (stage in ('interview','offer','day_30','probation','6_month','1_year')),
  from_party text        not null check (from_party in ('hm','talent')),
  rating     int         check (rating between 1 and 5),
  outcome    text,       -- party-specific outcome enum (see submit-feedback fn for values)
  free_text  text,
  feedback_tags jsonb,   -- AI-extracted behavioural tags from free_text
  diamond_points_awarded int not null default 0,
  created_at timestamptz not null default now(),
  constraint match_feedback_events_unique unique (match_id, stage, from_party)
);

-- ── Match lifecycle timeline (1 row per match, updated as events occur) ───────
create table if not exists match_lifecycle (
  match_id                uuid        primary key references matches(id) on delete cascade,
  interview_completed_at  timestamptz,
  offer_made_at           timestamptz,
  hired_at                timestamptz,
  start_date              date,
  probation_passed_at     timestamptz,
  probation_failed_at     timestamptz,
  separation_at           timestamptz,
  separation_reason       text,        -- voluntary | involuntary | mutual | role_misrepresented
  six_month_review_due_at timestamptz,
  one_year_review_due_at  timestamptz,
  updated_at              timestamptz not null default now()
);

-- ── Outcome log (source of truth for PHS calibration) ────────────────────────
create table if not exists match_outcomes (
  id          uuid        primary key default gen_random_uuid(),
  match_id    uuid        not null references matches(id) on delete cascade,
  outcome     text        not null,  -- attended_interview | no_show | accepted | declined |
                                     -- hired | passed_probation | quit_2w | quit_3m |
                                     -- employed_6m | employed_1y
  recorded_by text        not null default 'system',
  recorded_at timestamptz not null default now(),
  constraint match_outcomes_unique unique (match_id, outcome)
);

-- ── Talent: PHS rates + reputation ───────────────────────────────────────────
alter table talents
  add column if not exists phs_show_rate           float,   -- P(attends interview | match accepted)
  add column if not exists phs_accept_rate         float,   -- P(accepts offer | offer made) — historical
  add column if not exists phs_pass_probation_rate float,   -- P(passes probation | hired)
  add column if not exists phs_stay_6m_rate        float,   -- P(employed 6m | passed probation)
  add column if not exists phs_stay_1y_rate        float,   -- P(employed 1y | passed probation)
  add column if not exists reputation_score        float,   -- 0–100 stage-weighted avg rating
  add column if not exists feedback_tags           jsonb,   -- stage-weighted aggregated tags
  add column if not exists feedback_volume         int not null default 0;  -- total feedback events

-- ── HM / company: reputation ─────────────────────────────────────────────────
alter table hiring_managers
  add column if not exists phs_offer_accept_rate   float,   -- how often offers are accepted
  add column if not exists phs_retention_rate      float,   -- how long hires stay
  add column if not exists phs_truthfulness_score  float,   -- talent "role as described" rating
  add column if not exists reputation_score        float,
  add column if not exists feedback_tags           jsonb,
  add column if not exists feedback_volume         int not null default 0;

-- ── Diamond Points stage helper ───────────────────────────────────────────────
create or replace function diamond_points_for_stage(p_stage text)
returns int language sql immutable as $$
  select case p_stage
    when 'interview' then 5
    when 'offer'     then 5
    when 'day_30'    then 10
    when 'probation' then 20
    when '6_month'   then 30
    when '1_year'    then 50
    else 5
  end;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table match_feedback_events enable row level security;
alter table match_lifecycle       enable row level security;
alter table match_outcomes        enable row level security;

-- Admin: unrestricted
create policy "admin_all_feedback_events" on match_feedback_events for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admin_all_lifecycle" on match_lifecycle for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admin_all_outcomes" on match_outcomes for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Authenticated users can read feedback events on their own matches (both parties)
create policy "read_own_feedback_events" on match_feedback_events for select to authenticated
  using (
    exists (
      select 1 from matches m
      join talents t on t.id = m.talent_id
      where m.id = match_feedback_events.match_id and t.profile_id = auth.uid()
    ) or exists (
      select 1 from matches m
      join roles r on r.id = m.role_id
      join hiring_managers hm on hm.id = r.hiring_manager_id
      where m.id = match_feedback_events.match_id and hm.profile_id = auth.uid()
    )
  );

create policy "read_own_lifecycle" on match_lifecycle for select to authenticated
  using (
    exists (
      select 1 from matches m
      join talents t on t.id = m.talent_id
      where m.id = match_lifecycle.match_id and t.profile_id = auth.uid()
    ) or exists (
      select 1 from matches m
      join roles r on r.id = m.role_id
      join hiring_managers hm on hm.id = r.hiring_manager_id
      where m.id = match_lifecycle.match_id and hm.profile_id = auth.uid()
    )
  );
