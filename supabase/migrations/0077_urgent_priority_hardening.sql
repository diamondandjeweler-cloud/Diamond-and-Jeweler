-- ============================================================
-- 0077 — Urgent Priority Search hardening
--
-- Fixes audit-level bugs in 0076 before the feature ships:
--   - BUG 2: charge_urgent_priority's balance check was non-locking,
--            allowing a concurrent double-click to charge once for
--            two searches. Add SELECT ... FOR UPDATE on the profile row.
--   - BUG 4: refresh_limit_per_role silently blocks matchForRole.
--            Add can_run_urgent_match_for_role() so the Edge Function
--            can pre-check before charging.
-- ============================================================

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

  select coalesce((value)::int, 9) into v_cost
    from public.system_config where key = 'urgent_search_cost';
  if v_cost is null then v_cost := 9; end if;

  select coalesce((value)::int, 5) into v_cap
    from public.system_config where key = 'urgent_search_daily_cap';
  if v_cap is null then v_cap := 5; end if;

  -- Daily cap (rolling 24h). Same query as 0076 — check first so we
  -- don't even take the row lock for users already over the cap.
  select count(*)::int into v_today_count
    from public.urgent_priority_requests
   where user_id    = p_user_id
     and created_at >= now() - interval '24 hours'
     and status     in ('pending','processing','completed','no_result');
  if v_today_count >= v_cap then
    raise exception 'Daily urgent search cap reached (%/% in last 24h)',
      v_today_count, v_cap
      using errcode = 'P0001';
  end if;

  -- ── BUG 2 fix: row-lock the profile row so two concurrent calls
  -- serialise on it. A second concurrent request will block here, then
  -- re-read the now-decremented balance and correctly fail with
  -- 'Insufficient diamond points'. The lock is released at COMMIT.
  select coalesce(points, 0) into v_balance
    from public.profiles
   where id = p_user_id
   for update;

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
    update public.urgent_priority_requests
       set status = 'failed', error_message = 'Idempotency replay'
     where id = v_request_id;
    raise exception 'Charge already recorded' using errcode = 'P0001';
  end if;

  return query select v_request_id, v_cost, v_balance - v_cost;
end;
$$;

grant execute on function public.charge_urgent_priority(uuid, text, jsonb) to service_role;

-- ── BUG 4 fix: predicate the Edge Function can call BEFORE charging.
--
-- Returns:
--   ok=true  when matchForRole would actually run (no refresh-limit block,
--            role still active, vacancy not expired)
--   ok=false with a reason text the function can echo back to the user.
--
-- Mirrors the guards at the top of match-core.matchForRole so we never
-- charge a user 9 points for a search that the matching engine refuses
-- to run.
create or replace function public.can_run_urgent_match_for_role(
  p_role_id uuid
) returns table (ok boolean, reason text)
language plpgsql
stable
as $$
declare
  v_status text;
  v_expires timestamptz;
  v_refresh_limit int;
  v_refresh_count int;
begin
  select status, vacancy_expires_at
    into v_status, v_expires
    from public.roles where id = p_role_id;

  if v_status is null then
    return query select false, 'Role not found';
    return;
  end if;
  if v_status <> 'active' then
    return query select false, format('Role is %s', v_status);
    return;
  end if;
  if v_expires is not null and v_expires < now() then
    return query select false, 'Role vacancy has expired';
    return;
  end if;

  select coalesce((value)::int, 3) into v_refresh_limit
    from public.system_config where key = 'refresh_limit_per_role';
  if v_refresh_limit is null then v_refresh_limit := 3; end if;

  select count(*)::int into v_refresh_count
    from public.match_history
   where role_id = p_role_id and action = 'expired_auto';
  if v_refresh_count >= v_refresh_limit then
    return query select false, 'This role has hit the refresh limit — urgent search cannot deliver a new candidate. Refresh the role first.';
    return;
  end if;

  return query select true, null::text;
end;
$$;

grant execute on function public.can_run_urgent_match_for_role(uuid) to service_role, authenticated;
