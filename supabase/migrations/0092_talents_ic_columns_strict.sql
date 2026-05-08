-- 0092_talents_ic_columns_strict.sql
--
-- 0091 attempted column-level REVOKE on talents.ic_path / ic_verified /
-- ic_purged_at, but Postgres column-level REVOKE is overridden by an existing
-- broader table-level GRANT. The Supabase default `authenticated` role had
-- table-level SELECT/UPDATE on `public.talents`, so the column-level REVOKE
-- in 0091 was a no-op for that role.
--
-- Fix: revoke the table-level SELECT/UPDATE, then re-grant SELECT/UPDATE on
-- every column EXCEPT ic_path / ic_verified / ic_purged_at. Talent self-reads
-- now use the get_own_ic_metadata() RPC introduced in 0091. Admins use
-- admin_get_ic_metadata(uuid). HM never needs IC access (storage RLS already
-- denied them the file; this migration also denies them the path string).
--
-- Each column listed once. If you add a new column to talents in the future,
-- add it here too — otherwise authenticated talent users will lose read/write
-- on the new column.

-- ---------------------------------------------------------------------------
-- 1. Revoke the broad table-level grants from authenticated + anon.
-- ---------------------------------------------------------------------------

revoke select on public.talents from authenticated;
revoke update on public.talents from authenticated;
revoke select on public.talents from anon;
revoke update on public.talents from anon;

-- ---------------------------------------------------------------------------
-- 2. Re-grant SELECT on every column EXCEPT ic_path, ic_verified, ic_purged_at.
--    Authenticated only — anon stays denied.
-- ---------------------------------------------------------------------------

grant select (
  id,
  profile_id,
  date_of_birth_encrypted,
  resume_path,
  parsed_resume,
  privacy_mode,
  whitelist_companies,
  expected_salary_min,
  expected_salary_max,
  is_open_to_offers,
  interview_answers,
  preference_ratings,
  derived_tags,
  created_at,
  updated_at,
  extra_matches_used,
  gender,
  life_chart_character,
  location_matters,
  location_postcode,
  open_to_new_field,
  race,
  religion,
  languages,
  uses_lunar_calendar,
  profile_expires_at,
  deal_breakers,
  photo_url,
  has_driving_license,
  highest_qualification,
  employment_type_preferences,
  feedback_score,
  phs_show_rate,
  phs_accept_rate,
  phs_pass_probation_rate,
  phs_stay_6m_rate,
  phs_stay_1y_rate,
  reputation_score,
  feedback_tags,
  feedback_volume,
  deleted_at,
  current_employment_status,
  current_salary,
  notice_period_days,
  reason_for_leaving_category,
  reason_for_leaving_summary,
  education_level,
  has_management_experience,
  management_team_size,
  work_authorization,
  preferred_management_style,
  red_flags,
  deal_breaker_items,
  has_noncompete,
  noncompete_industry_scope,
  salary_structure_preference,
  role_scope_preference,
  career_goal_horizon,
  job_intention,
  shortest_tenure_months,
  avg_tenure_months,
  work_arrangement_preference,
  cultural_alignment_tags,
  extraction_status,
  extraction_started_at,
  extraction_completed_at,
  extraction_error,
  extraction_attempts,
  growth_nudges_opt_in,
  region_code,
  last_growth_nudge_at,
  growth_nudge_snooze_until
) on public.talents to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Re-grant UPDATE on every column EXCEPT id / profile_id / created_at /
--    updated_at / extraction_* / feedback_* / phs_* / reputation_score / deleted_at
--    AND the three IC columns. The user-updatable subset.
-- ---------------------------------------------------------------------------

grant update (
  date_of_birth_encrypted,
  resume_path,
  parsed_resume,
  privacy_mode,
  whitelist_companies,
  expected_salary_min,
  expected_salary_max,
  is_open_to_offers,
  interview_answers,
  preference_ratings,
  derived_tags,
  gender,
  life_chart_character,
  location_matters,
  location_postcode,
  open_to_new_field,
  race,
  religion,
  languages,
  uses_lunar_calendar,
  profile_expires_at,
  deal_breakers,
  photo_url,
  has_driving_license,
  highest_qualification,
  employment_type_preferences,
  current_employment_status,
  current_salary,
  notice_period_days,
  reason_for_leaving_category,
  reason_for_leaving_summary,
  education_level,
  has_management_experience,
  management_team_size,
  work_authorization,
  preferred_management_style,
  red_flags,
  deal_breaker_items,
  has_noncompete,
  noncompete_industry_scope,
  salary_structure_preference,
  role_scope_preference,
  career_goal_horizon,
  job_intention,
  shortest_tenure_months,
  avg_tenure_months,
  work_arrangement_preference,
  cultural_alignment_tags,
  growth_nudges_opt_in,
  region_code
) on public.talents to authenticated;

-- INSERT/DELETE not changed; existing talents_insert_self policy still controls
-- whether a talent can create their row (and ic_path defaults to null at
-- insert time — talent uploads after the row exists).

-- End of 0092
