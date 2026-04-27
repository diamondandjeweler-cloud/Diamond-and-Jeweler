-- ============================================================
-- BoLe Platform — Background-match flags + role industry
--
-- Two boolean flags drive how off-field applicants are treated:
--   roles.accept_no_experience  — HM picks per role at PostRole.
--     true  => career-changers welcome (small penalty only).
--     false => background must overlap; senior/lead roles hard-skip.
--   talents.open_to_new_field    — applicant flag at onboarding.
--     true  => penalty waived for gig/part-time/internship roles.
--
-- Plus roles.industry text so background overlap can be checked
-- against role-side metadata, not just the role title.
-- ============================================================

alter table public.roles
  add column if not exists industry text,
  add column if not exists accept_no_experience boolean not null default false;

alter table public.talents
  add column if not exists open_to_new_field boolean not null default false;

insert into public.system_config (key, value) values
  ('weight_background', '0.15'::jsonb)
on conflict (key) do nothing;
