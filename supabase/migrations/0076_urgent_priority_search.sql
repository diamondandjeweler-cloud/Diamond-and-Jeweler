-- ============================================================
-- 0076 — Urgent Priority Search using Diamond Points
--
-- Lets a user spend 9 Diamond Points to receive ONE top-ranked
-- result immediately:
--   - Hiring Manager → top candidate for a specific role
--   - Talent         → top open role matching their basic prefs
--
-- New objects:
--   - matches.is_urgent                         (highlight flag)
--   - urgent_priority_requests                  (audit + queue)
--   - system_config.urgent_search_cost = 9
--   - system_config.urgent_search_daily_cap = 5 (per user, anti-abuse)
--   - charge_urgent_priority(...)               (atomic: balance check + deduct + insert request)
--   - get_urgent_jobs_for_talent(...)           (single SQL filter for talent-side job lookup)
--   - mark_urgent_request_completed(...)        (closes the request row)
-- ============================================================

-- 1) Highlight flag on matches.
alter table public.matches
  add column if not exists is_urgent boolean not null default false;

create index if not exists idx_matches_is_urgent
  on public.matches(is_urgent)
  where is_urgent = true;

-- 2) Urgent priority requests — audit ledger + processing state.
create table if not exists public.urgent_priority_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  request_type  text not null check (request_type in ('find_worker','find_job')),
  cost          int  not null,
  context       jsonb not null default '{}'::jsonb,   -- { role_id?, talent_id?, filters? }
  status        text not null default 'pending'
    check (status in ('pending','processing','completed','failed','no_result')),
  result_kind   text check (result_kind in ('match','role','talent')),
  result_id     uuid,
  error_message text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  completed_at  timestamptz
);

create index if not exists idx_upr_user_created
  on public.urgent_priority_requests(user_id, created_at desc);
create index if not exists idx_upr_status_created
  on public.urgent_priority_requests(status, created_at desc);

alter table public.urgent_priority_requests enable row level security;

drop policy if exists upr_select_self on public.urgent_priority_requests;
create policy upr_select_self on public.urgent_priority_requests
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists upr_admin_all on public.urgent_priority_requests;
create policy upr_admin_all on public.urgent_priority_requests
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3) System config — cost and daily cap.
insert into public.system_config (key, value) values
  ('urgent_search_cost',      to_jsonb(9)),
  ('urgent_search_daily_cap', to_jsonb(5))
on conflict (key) do nothing;

-- 4) Atomic charge: balance check + ledger insert + profile decrement
--    + urgent request row, all in one transaction. Idempotent via
--    point_transactions.idempotency_key (server-supplied per request).
create or replace function public.charge_urgent_priority(
  p_user_id      uuid,
  p_request_type text,
  p_context      jsonb default '{}'::jsonb
) returns table (request_id uuid, cost int, balance_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost int;
  v_cap  int;
  v_balance int;
  v_today_count int;
  v_request_id uuid;
  v_idempotency text;
  v_awarded int;
begin
  if p_request_type not in ('find_worker','find_job') then
    raise exception 'invalid request_type %', p_request_type
      using errcode = '22023';
  end if;

  -- Read cost + cap from system_config (fallback defaults).
  select coalesce((value)::int, 9)
    into v_cost
    from public.system_config
   where key = 'urgent_search_cost';
  if v_cost is null then v_cost := 9; end if;

  select coalesce((value)::int, 5)
    into v_cap
    from public.system_config
   where key = 'urgent_search_daily_cap';
  if v_cap is null then v_cap := 5; end if;

  -- Daily cap (rolling 24h) — counts all completed/pending/processing requests.
  select count(*)::int
    into v_today_count
    from public.urgent_priority_requests
   where user_id    = p_user_id
     and created_at >= now() - interval '24 hours'
     and status     in ('pending','processing','completed','no_result');
  if v_today_count >= v_cap then
    raise exception 'Daily urgent search cap reached (%/% in last 24h)',
      v_today_count, v_cap
      using errcode = 'P0001';
  end if;

  -- Balance.
  select coalesce(points, 0) into v_balance
    from public.profiles where id = p_user_id;
  if v_balance is null or v_balance < v_cost then
    raise exception 'Insufficient diamond points (need %, have %)',
      v_cost, coalesce(v_balance, 0)
      using errcode = 'P0001';
  end if;

  -- Insert request row first so we have an id to log against.
  insert into public.urgent_priority_requests
    (user_id, request_type, cost, context, status)
  values
    (p_user_id, p_request_type, v_cost, coalesce(p_context, '{}'::jsonb), 'processing')
  returning id into v_request_id;

  -- Atomic deduction with idempotency key derived from request_id.
  v_idempotency := 'urgent:' || v_request_id::text;
  v_awarded := public.award_points(
    p_user_id        => p_user_id,
    p_delta          => -v_cost,
    p_reason         => 'urgent_priority_' || p_request_type,
    p_reference      => jsonb_build_object('urgent_request_id', v_request_id),
    p_idempotency_key => v_idempotency
  );
  if v_awarded = 0 then
    -- Should never happen since we just minted the key, but guard anyway.
    update public.urgent_priority_requests
       set status = 'failed', error_message = 'Idempotency replay'
     where id = v_request_id;
    raise exception 'Charge already recorded' using errcode = 'P0001';
  end if;

  return query select v_request_id, v_cost, v_balance - v_cost;
end;
$$;

grant execute on function public.charge_urgent_priority(uuid, text, jsonb) to service_role;

-- 5) Talent-side job lookup. Returns one role id ranked best-fit-first.
--    Matches the talent against basic role hard filters (employment type,
--    salary range, work arrangement, vacancy still open). Ordered by
--    feedback_score-style HM quality and recency. Excludes roles the
--    talent already has a match against.
create or replace function public.get_urgent_jobs_for_talent(
  p_talent_id uuid,
  p_limit     int default 1
) returns table (role_id uuid)
language sql
stable
as $$
  with t as (
    select id, employment_type_preferences, expected_salary_min,
           work_authorization, deal_breakers
      from public.talents
     where id = p_talent_id
  )
  select r.id as role_id
    from public.roles r
    cross join t
   where r.status = 'active'
     and (r.vacancy_expires_at is null or r.vacancy_expires_at >= now())
     and not exists (
       select 1 from public.matches m
        where m.role_id = r.id and m.talent_id = t.id
     )
     -- Employment type alignment (if talent expressed prefs)
     and (
       t.employment_type_preferences is null
       or array_length(t.employment_type_preferences, 1) is null
       or coalesce(r.employment_type, 'full_time') = any (t.employment_type_preferences)
     )
     -- Salary alignment: talent's expected min must fit in role's max
     and (
       t.expected_salary_min is null
       or r.salary_max is null
       or t.expected_salary_min <= r.salary_max
     )
     -- Talent deal-breakers
     and (
       (t.deal_breakers->>'no_weekend_work')::boolean is not true
       or coalesce(r.requires_weekend, false) = false
     )
     and (
       (t.deal_breakers->>'no_driving_license')::boolean is not true
       or coalesce(r.requires_driving_license, false) = false
     )
     and (
       (t.deal_breakers->>'remote_only')::boolean is not true
       or r.work_arrangement in ('remote','hybrid')
     )
   order by coalesce(r.created_at, now()) desc
   limit greatest(1, p_limit);
$$;

grant execute on function public.get_urgent_jobs_for_talent(uuid, int) to service_role, authenticated;

-- 6) Closer for an urgent request — sets terminal state + result link.
create or replace function public.mark_urgent_request_completed(
  p_request_id uuid,
  p_status     text,
  p_result_kind text default null,
  p_result_id   uuid default null,
  p_error       text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('completed','failed','no_result') then
    raise exception 'invalid terminal status %', p_status using errcode = '22023';
  end if;
  update public.urgent_priority_requests
     set status        = p_status,
         result_kind   = p_result_kind,
         result_id     = p_result_id,
         error_message = p_error,
         processed_at  = coalesce(processed_at, now()),
         completed_at  = now()
   where id = p_request_id;
end;
$$;

grant execute on function public.mark_urgent_request_completed(uuid, text, text, uuid, text) to service_role;
