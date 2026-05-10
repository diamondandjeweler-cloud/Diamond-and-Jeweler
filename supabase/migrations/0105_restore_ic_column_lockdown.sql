-- 0105_restore_ic_column_lockdown.sql
--
-- LAUNCH-CRITICAL: 0103_admin_visibility_v2.sql contains
-- `grant select on public.talents to authenticated;` which silently undid
-- the column-level lockdown migration 0092 had carefully put in place to
-- close TC-255 (HMs seeing talents.ic_path string in REST embeds).
--
-- After 0103, `select id, ic_path from talents` from any authenticated
-- session returns ic_path again — the very leak we fixed. Verified post-
-- 0103 via information_schema.column_privileges:
--    grantee=authenticated, privilege_type=SELECT  ← exists for ic_path again
--
-- Why 0103 did this: it was trying to fix F8 (admin Matches tab "permission
-- denied for table talents") by belt-and-bracing table-level GRANT SELECT.
-- 0104 then took a different approach (SECURITY DEFINER `get_admin_matches`
-- RPC) and the React app (apps/web/src/routes/dashboard/admin/MatchPanel.tsx)
-- now calls `supabase.rpc('get_admin_matches', ...)` instead of the embed.
--
-- So the table-level SELECT grant from 0103 is no longer needed for that
-- code path. We can safely re-tighten talents to column-level grants per
-- 0092's design without breaking the admin Matches tab.
--
-- Verified that all current authenticated REST embeds on talents request
-- only specific safe columns (HMDashboard, HRDashboard, InterviewFeedback,
-- TalentDashboard, MatchApprovalPanel) — none use `select('*')` and none
-- request the IC columns. So column-level grants suffice.
--
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Revoke the broad table-level grants 0103 re-introduced
-- ---------------------------------------------------------------------------

revoke select on public.talents from authenticated;
revoke update on public.talents from authenticated;
revoke select on public.talents from anon;
revoke update on public.talents from anon;

-- ---------------------------------------------------------------------------
-- Re-grant SELECT on every column EXCEPT ic_path, ic_verified, ic_purged_at
-- (column list verified live against information_schema 2026-05-11)
-- ---------------------------------------------------------------------------

grant select (
  id, profile_id, date_of_birth_encrypted, resume_path, parsed_resume,
  privacy_mode, whitelist_companies, expected_salary_min, expected_salary_max,
  is_open_to_offers, interview_answers, preference_ratings, derived_tags,
  created_at, updated_at, extra_matches_used, gender, life_chart_character,
  location_matters, location_postcode, open_to_new_field, race, religion,
  languages, uses_lunar_calendar, profile_expires_at, deal_breakers, photo_url,
  has_driving_license, highest_qualification, employment_type_preferences,
  feedback_score, phs_show_rate, phs_accept_rate, phs_pass_probation_rate,
  phs_stay_6m_rate, phs_stay_1y_rate, reputation_score, feedback_tags,
  feedback_volume, deleted_at, current_employment_status, current_salary,
  notice_period_days, reason_for_leaving_category, reason_for_leaving_summary,
  education_level, has_management_experience, management_team_size,
  work_authorization, preferred_management_style, red_flags, deal_breaker_items,
  has_noncompete, noncompete_industry_scope, salary_structure_preference,
  role_scope_preference, career_goal_horizon, job_intention,
  shortest_tenure_months, avg_tenure_months, work_arrangement_preference,
  cultural_alignment_tags, extraction_status, extraction_started_at,
  extraction_completed_at, extraction_error, extraction_attempts,
  growth_nudges_opt_in, region_code, last_growth_nudge_at,
  growth_nudge_snooze_until
) on public.talents to authenticated;

-- ---------------------------------------------------------------------------
-- UPDATE on the user-writable subset (excludes id/profile_id/timestamps/
-- extraction_*/feedback_*/phs_*/reputation_score/deleted_at PLUS the IC trio)
-- ---------------------------------------------------------------------------

grant update (
  date_of_birth_encrypted, resume_path, parsed_resume, privacy_mode,
  whitelist_companies, expected_salary_min, expected_salary_max,
  is_open_to_offers, interview_answers, preference_ratings, derived_tags,
  gender, life_chart_character, location_matters, location_postcode,
  open_to_new_field, race, religion, languages, uses_lunar_calendar,
  profile_expires_at, deal_breakers, photo_url, has_driving_license,
  highest_qualification, employment_type_preferences,
  current_employment_status, current_salary, notice_period_days,
  reason_for_leaving_category, reason_for_leaving_summary, education_level,
  has_management_experience, management_team_size, work_authorization,
  preferred_management_style, red_flags, deal_breaker_items, has_noncompete,
  noncompete_industry_scope, salary_structure_preference,
  role_scope_preference, career_goal_horizon, job_intention,
  shortest_tenure_months, avg_tenure_months, work_arrangement_preference,
  cultural_alignment_tags, growth_nudges_opt_in, region_code
) on public.talents to authenticated;

-- INSERT/DELETE table-level grants are unchanged (RLS controls who can do these).

-- End of 0105
