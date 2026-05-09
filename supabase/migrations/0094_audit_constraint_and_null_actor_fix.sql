-- 0094_audit_constraint_and_null_actor_fix.sql
--
-- Two LAUNCH-BLOCKING bugs in migration 0090 caught by Round-6 E2E test
-- (cascading match status from generated → viewed → invited_by_manager → ...
-- → hired). Each transition's UPDATE rolled back because the AFTER trigger
-- raised one of:
--
--   1. ERROR 23514: violates audit_log_action_check
--      We emitted action labels like 'interview_invited', 'contact_revealed',
--      'cv_downloaded', 'hired', 'profile_viewed', 'match_declined_by_talent',
--      'interview_round_scheduled', etc. — none of which are in the original
--      action allowlist (which had only ~38 audit-and-auth-focused actions).
--
--   2. ERROR 23503: violates audit_log_actor_id_fkey
--      We used coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
--      as the fallback when auth.uid() is NULL (cron / SECURITY DEFINER
--      contexts). The all-zeros UUID is not a real auth.users row, so the
--      FK reference failed.
--
-- Effect in production had this not been caught: every HM clicking "Invite",
-- every talent accepting, every interview scheduled, every offer made, every
-- contact reveal, every CV download — would have shown the user a 500 error
-- and the underlying state change would have rolled back. The matching
-- pipeline would have been completely unusable.
--
-- Fix:
--   (a) Extend audit_log_action_check allowlist with the operational actions
--       migration 0090 emits.
--   (b) Update trg_audit_match_status_change + trg_audit_interview_round_change
--       to pass NULL (not zero-UUID) when auth.uid() is NULL. The actor_id
--       column already allows NULL.

-- ---------------------------------------------------------------------------
-- (a) Replace the action-allowlist CHECK constraint
-- ---------------------------------------------------------------------------

alter table public.audit_log
  drop constraint if exists audit_log_action_check;

alter table public.audit_log
  add constraint audit_log_action_check
  check (action = any (array[
    -- ── original 0063 actions (kept) ──
    'login', 'logout', 'login_failed', 'session_expired',
    'password_changed', 'password_reset_requested',
    'mfa_enrolled', 'mfa_challenge_passed', 'mfa_challenge_failed',
    'account_created', 'account_soft_deleted', 'account_restored', 'profile_updated',
    'consent_granted', 'consent_revoked', 'consent_renewed',
    'dsr_submitted', 'dsr_completed', 'dsr_export_downloaded',
    'admin_profile_view', 'admin_talent_view', 'admin_file_view', 'admin_action',
    'file_uploaded', 'file_deleted', 'file_viewed',
    'match_generated', 'match_accepted', 'match_declined', 'match_expired',
    'offer_made', 'offer_accepted', 'offer_declined',
    'breach_detected', 'breach_notified_dpo', 'breach_notified_user',
    'data_purged', 'cron_run',
    -- ── 0090 PDPA section-10 operational actions (added) ──
    'profile_viewed',
    'interview_invited',
    'match_declined_by_talent',
    'match_declined_by_hm',
    'hr_scheduling_started',
    'interview_scheduled',
    'interview_completed',
    'hired',
    'contact_revealed',
    'cv_downloaded',
    -- ── interview-round granular actions (0090) ──
    'interview_round_scheduled',
    'interview_round_rescheduled',
    'interview_round_completed',
    'interview_round_cancelled',
    'interview_round_no_show',
    -- ── 0091 admin IC metadata access ──
    'admin_ic_metadata_viewed'
  ]));

-- ---------------------------------------------------------------------------
-- (b) Re-create the two triggers' functions to pass NULL when auth.uid() is NULL
-- ---------------------------------------------------------------------------

create or replace function public.trg_audit_match_status_change()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_action       text;
  v_actor_role   text;
  v_subject_id   uuid;
begin
  if tg_op = 'UPDATE' and (old.status is not distinct from new.status) then
    return new;
  end if;

  v_subject_id := (select profile_id from public.talents where id = new.talent_id);

  case new.status
    when 'invited_by_manager'   then v_action := 'interview_invited';     v_actor_role := 'hiring_manager';
    when 'accepted_by_talent'   then v_action := 'match_accepted';        v_actor_role := 'talent';
    when 'declined_by_talent'   then v_action := 'match_declined_by_talent'; v_actor_role := 'talent';
    when 'declined_by_manager'  then v_action := 'match_declined_by_hm';   v_actor_role := 'hiring_manager';
    when 'hr_scheduling'        then v_action := 'hr_scheduling_started'; v_actor_role := 'hiring_manager';
    when 'interview_scheduled'  then v_action := 'interview_scheduled';   v_actor_role := 'hiring_manager';
    when 'interview_completed'  then v_action := 'interview_completed';   v_actor_role := 'hiring_manager';
    when 'offer_made'           then v_action := 'offer_made';            v_actor_role := 'hiring_manager';
    when 'hired'                then v_action := 'hired';                 v_actor_role := 'talent';
    when 'expired'              then v_action := 'match_expired';         v_actor_role := 'system';
    when 'viewed'               then v_action := 'profile_viewed';        v_actor_role := 'hiring_manager';
    else
      return new;
  end case;

  -- Pass NULL (not zero-UUID) when auth.uid() is NULL (system / SECURITY DEFINER context).
  perform public.log_audit_event(
    p_actor_id     => auth.uid(),
    p_actor_role   => v_actor_role,
    p_subject_id   => v_subject_id,
    p_action       => v_action,
    p_resource_type=> 'match',
    p_resource_id  => new.id::text,
    p_metadata     => jsonb_build_object(
      'old_status', coalesce(old.status, 'NEW'),
      'new_status', new.status,
      'role_id',    new.role_id
    )
  );
  return new;
end;
$function$;

create or replace function public.trg_audit_interview_round_change()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_action      text;
  v_subject_id  uuid;
  v_role_id     uuid;
begin
  if tg_op = 'UPDATE' and (old.status is not distinct from new.status) then
    return new;
  end if;

  select t.profile_id, m.role_id
  into   v_subject_id, v_role_id
  from   public.matches m
  join   public.talents t on t.id = m.talent_id
  where  m.id = new.match_id;

  if tg_op = 'INSERT' then
    v_action := 'interview_round_scheduled';
  else
    case new.status
      when 'scheduled'  then v_action := 'interview_round_rescheduled';
      when 'completed'  then v_action := 'interview_round_completed';
      when 'cancelled'  then v_action := 'interview_round_cancelled';
      when 'no_show'    then v_action := 'interview_round_no_show';
      else return new;
    end case;
  end if;

  perform public.log_audit_event(
    p_actor_id     => auth.uid(),
    p_actor_role   => 'hiring_manager',
    p_subject_id   => v_subject_id,
    p_action       => v_action,
    p_resource_type=> 'interview_round',
    p_resource_id  => new.id::text,
    p_metadata     => jsonb_build_object(
      'match_id',     new.match_id,
      'role_id',      v_role_id,
      'round_number', new.round_number,
      'scheduled_at', new.scheduled_at
    )
  );
  return new;
end;
$function$;

-- End of 0094
