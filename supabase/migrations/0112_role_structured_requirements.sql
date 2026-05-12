-- 0112_role_structured_requirements.sql
--
-- Adds structured matching surface for roles + talents:
--   • Schedule / shift / off-day pattern
--   • Education minimum (role-driven, overriding hardcoded EDU_MIN by experience_level)
--   • Skills + preferred skills (tag arrays, backed by skill_taxonomy)
--   • Languages required (with proficiency level)
--   • Physical / environment flags
--   • Career-scope "open to" (fresh-grad, switcher, intern, etc.)
--   • Headcount, reports-to, direct team size
--   • Probation, interview process, start urgency
--   • Per-role eligibility override (work_authorization)
--   • Non-negotiables free-text + AI-extracted atom array (mirror on both sides)
--
-- Designed so existing data keeps working: every column is nullable or has a
-- safe default. Matching renormalisation in match-core.ts already excludes
-- null-score dimensions, so legacy talents/roles score the same until new
-- data is filled in.

-- ── ROLES ────────────────────────────────────────────────────────────────────
alter table public.roles
  -- 1. Schedule & shift
  add column if not exists schedule_start_time time,
  add column if not exists schedule_end_time   time,
  add column if not exists days_per_week       int  check (days_per_week is null or days_per_week between 1 and 7),
  add column if not exists off_day_pattern     text check (off_day_pattern is null or off_day_pattern in
    ('weekends','rotating','fixed_weekday','split','irregular')),
  add column if not exists shift_type          text check (shift_type is null or shift_type in
    ('day','night','rotating','split','flexible')),
  -- 2. Education minimum (role-driven)
  add column if not exists min_education_level text check (min_education_level is null or min_education_level in
    ('none','spm','diploma','degree','masters','phd','professional_cert')),
  add column if not exists min_education_class text check (min_education_class is null or min_education_class in
    ('pass','third','second_lower','second_upper','first')),
  -- 3. Skills
  add column if not exists required_skills     text[] not null default '{}',
  add column if not exists preferred_skills    text[] not null default '{}',
  -- 4. Languages required (jsonb array of { code, level })
  add column if not exists languages_required  jsonb  not null default '[]'::jsonb,
  -- 5. Physical / environment
  add column if not exists environment_flags   text[] not null default '{}',
  -- 6. Career scope
  add column if not exists open_to             text[] not null default '{}',
  -- 7. Headcount
  add column if not exists headcount           int    not null default 1 check (headcount > 0 and headcount <= 1000),
  -- 8. Reporting / team
  add column if not exists reports_to_title    text,
  add column if not exists direct_team_size    int    check (direct_team_size is null or direct_team_size >= 0),
  -- 9. Probation
  add column if not exists probation_months    int    check (probation_months is null or probation_months between 0 and 12),
  -- 10. Interview
  add column if not exists interview_process   text   check (interview_process is null or interview_process in
    ('walk_in','single_interview','two_rounds','assessment_required','panel')),
  -- 11. Start urgency (per-role; overrides HM-level default)
  add column if not exists start_urgency       text   check (start_urgency is null or start_urgency in
    ('immediate','within_2_weeks','within_1_month','flexible')),
  -- 12. Eligibility (per-role override of hiring_managers.required_work_authorization)
  add column if not exists eligibility_work_auth text[] not null default '{}',
  -- 13. Non-negotiables (free text + AI atoms)
  add column if not exists non_negotiables_text  text,
  add column if not exists non_negotiables_atoms jsonb not null default '[]'::jsonb;

comment on column public.roles.min_education_level is
  'Role-driven education minimum. When NULL, matcher falls back to EDU_MIN by experience_level.';
comment on column public.roles.required_skills is
  'Tag array. Hard filter: candidate must have ALL of these in talents.skills.';
comment on column public.roles.preferred_skills is
  'Tag array. Soft signal; adds to skill_match score but never excludes.';
comment on column public.roles.languages_required is
  'Array of { code: text, level: basic|conversational|fluent|native }. Hard filter on code, soft on level.';
comment on column public.roles.environment_flags is
  'Working environment characteristics: standing_long_hours, heavy_lifting, outdoor, aircon_office, noisy, food_hygiene, hazardous, customer_facing.';
comment on column public.roles.open_to is
  'Candidate type whitelist: fresh_grad, career_switcher, experienced, student, intern. Empty = no restriction.';
comment on column public.roles.eligibility_work_auth is
  'Per-role work_authorization whitelist. Empty array = inherit from hiring_managers.required_work_authorization.';
comment on column public.roles.non_negotiables_text is
  'HM-entered free text describing absolute deal-breakers for this role. Visible to candidates on the role page.';
comment on column public.roles.non_negotiables_atoms is
  'AI-extracted structured atoms from non_negotiables_text. Matcher uses these as hard/soft filters. Re-extracted on text change.';

-- ── TALENTS ──────────────────────────────────────────────────────────────────
alter table public.talents
  -- Skills inventory
  add column if not exists skills              text[] not null default '{}',
  -- Environment preferences (matches roles.environment_flags vocabulary)
  add column if not exists environment_preferences text[] not null default '{}',
  -- Candidate-type self-identification
  add column if not exists candidate_types     text[] not null default '{}',
  -- Schedule availability
  add column if not exists available_days_per_week int  check (available_days_per_week is null or available_days_per_week between 1 and 7),
  add column if not exists available_shifts   text[] not null default '{}',
  -- Language proficiency (mirrors roles.languages_required shape)
  add column if not exists languages_proficiency jsonb not null default '[]'::jsonb,
  -- Non-negotiables (free text + AI atoms)
  add column if not exists priority_concerns_text  text,
  add column if not exists priority_concerns_atoms jsonb not null default '[]'::jsonb;

comment on column public.talents.skills is
  'Tag array of talent skills, drawn from skill_taxonomy + free-add. Used by skill_match score and hard filter against roles.required_skills.';
comment on column public.talents.environment_preferences is
  'Talent-tolerated environment flags. Matched against roles.environment_flags.';
comment on column public.talents.candidate_types is
  'Talent self-identifies as fresh_grad / career_switcher / experienced / student / intern. Matched against roles.open_to.';
comment on column public.talents.available_shifts is
  'Subset of: day, night, rotating, split, flexible. Matched against roles.shift_type.';
comment on column public.talents.languages_proficiency is
  'Array of { code, level }. Backfilled from legacy talents.languages at level=conversational.';
comment on column public.talents.priority_concerns_text is
  'Talent-entered free text describing absolute deal-breakers. Never shown to HM; only the extracted atoms surface.';
comment on column public.talents.priority_concerns_atoms is
  'AI-extracted structured atoms from priority_concerns_text. Matcher uses these as hard/soft filters.';

-- ── COMPANIES.size constraint (already exists as freeform text) ─────────────
-- Normalise the allowed values so company_size atoms can match. NOT VALID
-- means existing rows are skipped (any legacy free-form values stay put);
-- the constraint only fires on new inserts and updates. Run a separate
-- VALIDATE CONSTRAINT migration once the data team has cleaned old rows.
alter table public.companies
  drop constraint if exists companies_size_check;
alter table public.companies
  add constraint companies_size_check
    check (size is null or size in ('startup','sme','mnc','enterprise','govt','ngo'))
    not valid;

-- ── BACKFILL: talents.languages_proficiency from legacy talents.languages ──
update public.talents
   set languages_proficiency = (
     select coalesce(jsonb_agg(jsonb_build_object('code', code, 'level', 'conversational')), '[]'::jsonb)
     from unnest(coalesce(languages, '{}'::text[])) as code
   )
 where languages_proficiency = '[]'::jsonb
   and coalesce(array_length(languages, 1), 0) > 0;

-- ── SKILL TAXONOMY ──────────────────────────────────────────────────────────
create table if not exists public.skill_taxonomy (
  slug        text primary key,
  display_en  text not null,
  display_ms  text,
  display_zh  text,
  category    text not null check (category in (
    'digital','trade','hospitality','clinical','sales','ops','language','soft','finance','creative','industrial','automotive','logistics','beauty','education_skill','security','agri'
  )),
  aliases     text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists idx_skill_taxonomy_category on public.skill_taxonomy(category);
create index if not exists idx_skill_taxonomy_aliases_gin on public.skill_taxonomy using gin (aliases);

alter table public.skill_taxonomy enable row level security;

create policy if not exists skill_taxonomy_read on public.skill_taxonomy
  for select using (true);

-- Only service_role can mutate (seed migrations + admin tools only)
create policy if not exists skill_taxonomy_admin_write on public.skill_taxonomy
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── INDEXES ─────────────────────────────────────────────────────────────────
create index if not exists idx_roles_min_education       on public.roles(min_education_level);
create index if not exists idx_roles_required_skills_gin on public.roles using gin (required_skills);
create index if not exists idx_roles_languages_gin       on public.roles using gin (languages_required);
create index if not exists idx_roles_environment_gin     on public.roles using gin (environment_flags);
create index if not exists idx_roles_open_to_gin         on public.roles using gin (open_to);
create index if not exists idx_roles_eligibility_gin     on public.roles using gin (eligibility_work_auth);
create index if not exists idx_roles_nn_atoms_gin        on public.roles using gin (non_negotiables_atoms);

create index if not exists idx_talents_skills_gin        on public.talents using gin (skills);
create index if not exists idx_talents_environment_gin   on public.talents using gin (environment_preferences);
create index if not exists idx_talents_candidate_gin     on public.talents using gin (candidate_types);
create index if not exists idx_talents_languages_gin     on public.talents using gin (languages_proficiency);
create index if not exists idx_talents_pc_atoms_gin      on public.talents using gin (priority_concerns_atoms);

-- ── HELPER: education rank function (used by RPC + scoring) ─────────────────
create or replace function public.edu_rank(level text) returns int
  language sql immutable as $$
  select case lower(coalesce(level, ''))
    when 'none' then 0
    when 'spm' then 1
    when 'diploma' then 2
    when 'professional_cert' then 2
    when 'degree' then 3
    when 'masters' then 4
    when 'phd' then 5
    else 0
  end
$$;

grant execute on function public.edu_rank(text) to authenticated, service_role;
