-- 0070_expanded_profile_fields.sql
--
-- Adds job-change evaluation fields to talents and hiring_managers
-- extracted by the upgraded Bo chat (Phase 3 AI depth upgrade).

-- ── talents ──────────────────────────────────────────────────────────────────

alter table public.talents
  add column if not exists has_noncompete              boolean,
  add column if not exists noncompete_industry_scope   text
    check (noncompete_industry_scope in ('same_industry','any_industry','none')),
  add column if not exists salary_structure_preference text
    check (salary_structure_preference in ('fixed_only','fixed_plus_variable','commission_ok','fully_commission_ok')),
  add column if not exists role_scope_preference       text
    check (role_scope_preference in ('specialist','generalist','flexible')),
  add column if not exists career_goal_horizon         text
    check (career_goal_horizon in ('senior_specialist','people_manager','career_pivot','entrepreneurial','undecided')),
  add column if not exists job_intention               text
    check (job_intention in ('long_term_commitment','skill_building','undecided')),
  add column if not exists shortest_tenure_months      integer,
  add column if not exists avg_tenure_months           integer;

-- ── hiring_managers ───────────────────────────────────────────────────────────

alter table public.hiring_managers
  add column if not exists career_growth_potential     text
    check (career_growth_potential in ('dead_end','structured_path','ad_hoc')),
  add column if not exists interview_stages            integer,
  add column if not exists panel_involved              boolean,
  add column if not exists required_work_authorization text[];

-- ── system_config: new scoring weights ───────────────────────────────────────

insert into public.system_config (key, value)
values
  ('weight_career_goal_fit',   '0.06'::jsonb),
  ('weight_job_intention_fit', '0.04'::jsonb)
on conflict (key) do nothing;

-- ── RLS: new columns inherit existing table policies ─────────────────────────
