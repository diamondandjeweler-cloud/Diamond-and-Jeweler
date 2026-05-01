-- ============================================================
-- Match Approval Queue
--
-- Adds a 'pending_approval' holding state that gates match
-- visibility behind admin approval. Controlled by the
-- system_config key 'match_approval_mode':
--   "manual"    — new matches start as pending_approval
--   "autopilot" — new matches start as generated (old behaviour)
--
-- State machine additions:
--   pending_approval → generated  (admin approves)
--   pending_approval → expired    (admin rejects)
--
-- RLS: talent and HM SELECT policies are updated to exclude
-- pending_approval rows at the database layer, so even a buggy
-- client can never expose an unapproved match.
-- ============================================================

-- 1. Add pending_approval transitions to the state machine trigger.
create or replace function public.validate_match_transition()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  legal constant text[][] := array[
    -- Approval-queue transitions (new).
    ['pending_approval',    'generated'],
    ['pending_approval',    'expired'],
    -- Standard pipeline transitions (unchanged from 0011).
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
  if new.status is not distinct from old.status then
    return new;
  end if;

  claim_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  );
  if claim_role = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  foreach pair slice 1 in array legal loop
    if pair[1] = old.status and pair[2] = new.status then
      is_legal := true;
      exit;
    end if;
  end loop;

  if not is_legal then
    raise exception 'Illegal match status transition: % → %', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- 2. Seed the approval mode config key (manual = default for first-run validation).
insert into public.system_config (key, value)
values ('match_approval_mode', '"manual"')
on conflict (key) do nothing;

-- 3. Update RLS: talent cannot see pending_approval matches.
--    Drop the existing talent SELECT policy (defined in 0003) and replace it.
drop policy if exists matches_select_talent on public.matches;

create policy matches_select_talent on public.matches
  for select using (
    matches.status <> 'pending_approval'
    and exists (
      select 1 from public.talents t
      where t.id = matches.talent_id and t.profile_id = auth.uid()
    )
  );

-- 4. Update RLS: HM cannot see pending_approval matches.
--    0015 already replaced the 0003 HM policy, so drop that version.
drop policy if exists matches_select_hm on public.matches;

create policy matches_select_hm on public.matches
  for select using (
    matches.status <> 'pending_approval'
    and exists (
      select 1
      from public.roles r
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where r.id = matches.role_id and hm.profile_id = auth.uid()
    )
  );

-- 5. Update RLS: HR admin cannot see pending_approval matches.
drop policy if exists matches_select_hr on public.matches;

create policy matches_select_hr on public.matches
  for select using (
    matches.status <> 'pending_approval'
    and exists (
      select 1
      from public.roles r
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      join public.companies c on c.id = hm.company_id
      join public.profiles p on p.email = c.primary_hr_email
      where r.id = matches.role_id
        and p.id = auth.uid()
        and p.role = 'hr_admin'
    )
  );
-- Admin policy (matches_all_admin) is unrestricted and already covers pending_approval.
