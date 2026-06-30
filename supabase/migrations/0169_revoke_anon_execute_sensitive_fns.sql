-- ============================================================================
-- 0169 — revoke anon EXECUTE on internal-only SECURITY DEFINER functions
--
-- Supabase's default privileges grant EXECUTE on every new function to anon +
-- authenticated. 74 of 78 SECURITY DEFINER functions in public are therefore
-- anon-invocable; the only thing stopping a logged-out caller from running the
-- crown jewels (DOB crypto, talent contact PII, the life-chart/BaZi reasoning
-- IP, admin RPCs) is each function's INTERNAL is_admin()/service_role gate.
--
-- This revokes anon EXECUTE on the functions that have NO legitimate logged-out
-- caller — defense-in-depth so anon can't even invoke them (the internal gate
-- stays as the second layer). authenticated is intentionally KEPT (admins / HMs
-- reach several of these through the internal gate or SECURITY DEFINER wrappers).
--
-- DELIBERATELY NOT TOUCHED (anon MUST keep EXECUTE or things break):
--   • is_admin / is_hm_for_match / is_talent_for_match / hm_can_see_talent /
--     talent_can_see_role / profile_visible_to_company_hr / user_is_* — called
--     INSIDE RLS policies; an anon SELECT evaluates them as the anon role.
--   • check_login_rate_limit / record_login_attempt / log_auth_failure /
--     check_and_increment_* — run during the pre-auth (anon) login path.
--   • record_consent / handle_new_user / tg_* / trg_* — signup + triggers.
--   • pipeline_health / active_talent_count / get_match_profile_preview(s) —
--     public/health surface.
--
-- Idempotent: a DO-loop over the live signatures, so re-apply + overloads are
-- safe. authenticated/service_role grants are untouched.
-- ============================================================================

do $$
declare
  r record;
  target text[] := array[
    'decrypt_dob', 'encrypt_dob',
    'get_talent_contact', 'get_pending_match_reasoning',
    'get_own_ic_metadata', 'admin_get_ic_metadata',
    'admin_decide_role_moderation', 'get_admin_audit_log',
    'get_admin_kpis', 'get_admin_kpis_fast', 'get_admin_matches',
    'refresh_admin_kpis_mv', 'log_cv_download',
    '_warmup_schedule_edge_function', 'cron_deadman_check',
    'purge_soft_deleted_after_30d', 'send_onboarding_reminders',
    'claim_notification_retry_batch', 'recompute_talent_feedback_score'
  ];
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from   pg_proc p
    join   pg_namespace n on n.oid = p.pronamespace
    where  n.nspname = 'public'
      and  p.proname = any(target)
  loop
    execute format('revoke execute on function public.%I(%s) from anon', r.proname, r.args);
  end loop;
end $$;

notify pgrst, 'reload schema';
