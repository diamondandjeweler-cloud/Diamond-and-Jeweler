-- 0068_richer_onboarding_fields.sql
--
-- Adds new columns to talents and hiring_managers populated by the
-- upgraded chat-onboard extraction (Phase 1 & 2 AI chat upgrade).
--
-- Talent new fields: current situation, salary, leave reason, management exp,
--   education, work auth, deal-breakers, red-flags.
-- HM new fields: role open reason, team size, urgency, 90-day success,
--   must-haves (already exists), screening signals.

-- ── talents ──────────────────────────────────────────────────────────────────

alter table public.talents
  add column if not exists current_employment_status text
    check (current_employment_status in ('employed','unemployed','freelancing','studying')),
  add column if not exists current_salary             integer,   -- RM/month
  add column if not exists notice_period_days         integer,   -- 0 = immediate
  add column if not exists reason_for_leaving_category text
    check (reason_for_leaving_category in (
      'salary','growth','culture','personal','redundancy',
      'contract_end','relocation','career_pivot','other'
    )),
  add column if not exists reason_for_leaving_summary text,
  add column if not exists education_level            text
    check (education_level in ('spm','diploma','degree','masters','phd','professional_cert','other')),
  add column if not exists has_management_experience  boolean,
  add column if not exists management_team_size       integer,
  add column if not exists work_authorization         text
    check (work_authorization in ('citizen','pr','ep','rpt','dp','student_pass','other')),
  add column if not exists preferred_management_style text
    check (preferred_management_style in ('hands_on','autonomous','collaborative')),
  add column if not exists red_flags                  text[];    -- detected interview signals

-- deal_breakers already exists as jsonb; add deal_breaker_items text[] as a
-- flat array sibling so match-generate can filter without parsing JSON.
alter table public.talents
  add column if not exists deal_breaker_items         text[];

-- ── hiring_managers ───────────────────────────────────────────────────────────

alter table public.hiring_managers
  add column if not exists role_open_reason           text
    check (role_open_reason in ('new_headcount','replacement','backfill')),
  add column if not exists why_last_hire_left         text,
  add column if not exists team_size                  integer,
  add column if not exists hire_urgency               text
    check (hire_urgency in ('urgent','normal','exploring')),
  add column if not exists success_at_90_days         text,
  add column if not exists hardest_part_of_role       text,
  add column if not exists work_arrangement_offered   text
    check (work_arrangement_offered in ('on_site','hybrid','remote')),
  add column if not exists screening_red_flags        text[];

-- must_have_items: HM already has must_haves jsonb; add a flat array
-- so match-generate and watchouts panel can surface them without JSON parsing.
alter table public.hiring_managers
  add column if not exists must_have_items            text[];

-- ── RLS: new columns inherit existing table policies; nothing extra needed ───
