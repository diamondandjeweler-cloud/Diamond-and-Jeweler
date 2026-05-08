-- 0090_audit_critical_events.sql
--
-- Closes audit-log gaps surfaced by the pre-launch PDPA audit (2026-05-08).
-- Before this migration, the audit_log table only captured consent_granted /
-- consent_revoked / cron_run / admin_action. Per the PDPA section-10 spec, the
-- following events MUST also be logged for dispute-resolution defensibility:
--
--   - profile viewed       (HM views a talent card)         → 'profile_viewed'
--   - contact revealed     (HM clicks Reveal contact)       → 'contact_revealed'
--   - CV downloaded        (HM clicks resume download)      → 'cv_downloaded'
--   - interview invited    (HM invites talent)              → 'interview_invited'
--   - match accepted       (talent accepts invite)          → 'match_accepted'
--   - match declined       (talent or HM declines)          → 'match_declined_by_talent' / 'match_declined_by_hm'
--   - offer made           (HM makes offer)                 → 'offer_made'
--   - hired                (talent accepts offer)           → 'hired'
--   - interview scheduled  (round scheduled)                → 'interview_round_scheduled'
--   - interview cancelled  (round cancelled)                → 'interview_round_cancelled'
--   - interview completed  (round done)                     → 'interview_round_completed'
--
-- Implementation: status-transition trigger on matches + trigger on
-- interview_rounds + reveal-time emit inside get_talent_contact() + a
-- thin RPC log_cv_download() the client calls when fetching a resume.
--
-- All emits go through public.log_audit_event(...) which already exists.
-- audit_log RLS already enforces append-only + admin/owner-only SELECT.

-- ---------------------------------------------------------------------------
-- 1. get_talent_contact() — emit 'contact_revealed' AFTER the existing gate
-- ---------------------------------------------------------------------------

create or replace function public.get_talent_contact(p_match_id uuid)
  returns table(full_name text, email text, phone text)
  language plpgsql
  security definer
  set search_path to 'public', 'auth'
as $function$
declare
  v_status        text;
  v_hm_profile_id uuid;
  v_talent_pid    uuid;
  v_role_id       uuid;
begin
  select m.status, hm.profile_id, t.profile_id, m.role_id
  into   v_status, v_hm_profile_id, v_talent_pid, v_role_id
  from   matches m
  join   roles r            on r.id  = m.role_id
  join   hiring_managers hm on hm.id = r.hiring_manager_id
  join   talents t          on t.id  = m.talent_id
  where  m.id = p_match_id;

  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;

  if v_hm_profile_id <> auth.uid() and not public.is_admin() then
    raise exception 'Not authorized'  using errcode = '42501';
  end if;

  if v_status not in ('offer_made','hired') then
    raise exception 'Contact locked — make an offer first' using errcode = 'P0001';
  end if;

  -- Audit BEFORE returning the data so the row exists even if the caller
  -- aborts mid-stream. Failure to audit raises and the call fails closed.
  perform public.log_audit_event(
    p_actor_id     => auth.uid(),
    p_actor_role   => 'hiring_manager',
    p_subject_id   => v_talent_pid,
    p_action       => 'contact_revealed',
    p_resource_type=> 'match',
    p_resource_id  => p_match_id::text,
    p_metadata     => jsonb_build_object(
      'status_at_reveal', v_status,
      'role_id',          v_role_id
    )
  );

  return query
    select p.full_name, p.email, p.phone
    from   profiles p
    where  p.id = v_talent_pid;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Trigger on matches — emit audit row on every status transition
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
  v_subject_id   uuid;  -- the talent the action is about
  v_actor_id     uuid;  -- who triggered it (auth.uid() if available)
begin
  -- Only emit on actual status changes
  if tg_op = 'UPDATE' and (old.status is not distinct from new.status) then
    return new;
  end if;

  v_actor_id   := auth.uid();
  v_subject_id := (select profile_id from public.talents where id = new.talent_id);

  -- Map new.status to a stable action label the audit consumer can filter on
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
      -- 'generated', 'pending_approval' — system-only, skip.
      return new;
  end case;

  perform public.log_audit_event(
    p_actor_id     => coalesce(v_actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
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

drop trigger if exists trg_matches_status_audit on public.matches;
create trigger trg_matches_status_audit
  after insert or update of status on public.matches
  for each row
  execute function public.trg_audit_match_status_change();

-- ---------------------------------------------------------------------------
-- 3. Trigger on interview_rounds — schedule / cancel / complete events
-- ---------------------------------------------------------------------------

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

  -- Find the talent profile_id and role_id for this match
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
    p_actor_id     => coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
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

drop trigger if exists trg_interview_rounds_audit on public.interview_rounds;
create trigger trg_interview_rounds_audit
  after insert or update of status on public.interview_rounds
  for each row
  execute function public.trg_audit_interview_round_change();

-- ---------------------------------------------------------------------------
-- 4. RPC log_cv_download — clients call this when fetching a resume so the
--    storage-level fetch (which has no DB hook) gets an audit row.
-- ---------------------------------------------------------------------------

create or replace function public.log_cv_download(p_match_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'auth'
as $function$
declare
  v_hm_profile_id uuid;
  v_talent_pid    uuid;
  v_role_id       uuid;
  v_status        text;
begin
  -- Confirm the caller is the HM on this match (or admin) AND the match is in
  -- a state that legitimately permits resume access. This double-checks the
  -- storage-layer RLS so a wayward caller can't pollute the audit log with
  -- claims of downloads they weren't allowed to perform.
  select hm.profile_id, t.profile_id, r.id, m.status
  into   v_hm_profile_id, v_talent_pid, v_role_id, v_status
  from   public.matches m
  join   public.roles r            on r.id  = m.role_id
  join   public.hiring_managers hm on hm.id = r.hiring_manager_id
  join   public.talents t          on t.id  = m.talent_id
  where  m.id = p_match_id;

  if not found then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;

  if v_hm_profile_id <> auth.uid() and not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_status not in (
    'accepted_by_talent','invited_by_manager','hr_scheduling',
    'interview_scheduled','interview_completed','offer_made','hired'
  ) then
    raise exception 'CV access not permitted at this match status' using errcode = '42501';
  end if;

  perform public.log_audit_event(
    p_actor_id     => auth.uid(),
    p_actor_role   => 'hiring_manager',
    p_subject_id   => v_talent_pid,
    p_action       => 'cv_downloaded',
    p_resource_type=> 'match',
    p_resource_id  => p_match_id::text,
    p_metadata     => jsonb_build_object(
      'status_at_download', v_status,
      'role_id',            v_role_id
    )
  );
end;
$function$;

grant execute on function public.log_cv_download(uuid) to authenticated;

-- End of 0090
