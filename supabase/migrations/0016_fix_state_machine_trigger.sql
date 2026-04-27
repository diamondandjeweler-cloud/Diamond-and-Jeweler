-- ============================================================
-- BoLe Platform — Fix state-machine trigger bypass bug.
--
-- Bug in 0011: the trigger checked `current_user in ('postgres','supabase_admin')`
-- as its bypass condition. But the trigger function is SECURITY DEFINER, which
-- means `current_user` inside the body is always the function owner (postgres).
-- Result: every caller hit the bypass path and the state machine was never
-- actually enforced for authenticated users.
--
-- Fix: use `session_user` (the login role) for the superuser bypass.
-- SECURITY DEFINER does not rewrite session_user.
-- ============================================================

create or replace function public.validate_match_transition()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
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
    ['interview_completed', 'hired'],
    ['interview_completed', 'expired'],
    ['offer_made',          'hired'],
    ['offer_made',          'expired']
  ];
  pair text[];
  is_legal boolean := false;
  claim_role text;
begin
  -- Same-state "update" is a no-op.
  if new.status is not distinct from old.status then
    return new;
  end if;

  claim_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  );

  -- Bypass 1: no JWT claim at all. This is a direct DB session (psql,
  -- Management API, pg_cron body, migrations) — not a user-facing request.
  -- Also covers SECURITY DEFINER functions called from such sessions.
  if claim_role = '' then
    return new;
  end if;

  -- Bypass 2: service_role JWT (Edge Functions calling DB as service role).
  if claim_role = 'service_role' then
    return new;
  end if;

  -- Bypass 3: platform admin (v4 §15 — admin can force-regenerate).
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
    raise exception 'Illegal match status transition: % -> %', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;
