-- ============================================================
-- BoLe Platform — Server-side match state-machine enforcement
-- v4 PRD §13: "State transitions are enforced in Edge Functions,
-- not client-side." Dashboards currently call
-- supabase.from('matches').update({ status }) directly from the
-- browser, which means a malicious (or buggy) client can skip to
-- any status. We add a BEFORE UPDATE trigger that validates the
-- transition is legal per the v4 state machine.
--
-- Admin + service_role bypass (for cron-driven transitions like
-- expiry, admin force-regeneration, and cold-start seeding).
-- ============================================================

create or replace function public.validate_match_transition()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  -- Adjacency list of legal transitions. Each pair is (from, to).
  legal constant text[][] := array[
    ['generated',           'viewed'],
    ['generated',           'expired'],
    ['viewed',              'accepted_by_talent'],
    ['viewed',              'declined_by_talent'],
    ['viewed',              'invited_by_manager'],
    ['viewed',              'expired'],
    ['accepted_by_talent',  'invited_by_manager'],
    ['accepted_by_talent',  'expired'],
    ['invited_by_manager',  'hr_scheduling'],
    ['invited_by_manager',  'declined_by_manager'],
    ['invited_by_manager',  'accepted_by_talent'],
    ['invited_by_manager',  'expired'],
    ['hr_scheduling',       'interview_scheduled'],
    ['hr_scheduling',       'expired'],
    ['interview_scheduled', 'interview_completed'],
    ['interview_scheduled', 'expired'],
    ['interview_completed', 'offer_made'],
    ['interview_completed', 'hired'],       -- "Mark hired" shortcut from HR
    ['interview_completed', 'expired'],
    ['offer_made',          'hired'],
    ['offer_made',          'expired']
  ];
  pair text[];
  is_legal boolean := false;
  claim_role text;
begin
  -- Same-state "update" is a no-op, allow it.
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Bypass: service_role JWT (Edge Functions) or direct superuser (cron via pg_net).
  claim_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  );
  if claim_role = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  -- Bypass: platform admin (per v4 §15, admin can force-regenerate / fix stuck matches).
  if public.is_admin() then
    return new;
  end if;

  -- Enforce: transition must be in the legal list for regular users.
  foreach pair slice 1 in array legal loop
    if pair[1] = old.status and pair[2] = new.status then
      is_legal := true;
      exit;
    end if;
  end loop;

  if not is_legal then
    raise exception 'Illegal match status transition: % → %', old.status, new.status
      using errcode = '22023';  -- invalid_parameter_value
  end if;

  return new;
end;
$$;

comment on function public.validate_match_transition() is
  'BEFORE UPDATE trigger on public.matches — enforces v4 §13 state machine. Bypassed by service_role and admin.';

drop trigger if exists trg_validate_match_transition on public.matches;

create trigger trg_validate_match_transition
  before update of status on public.matches
  for each row
  execute function public.validate_match_transition();
