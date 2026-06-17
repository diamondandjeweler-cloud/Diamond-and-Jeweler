-- ============================================================
-- 0147 — award_points: return 0 on concurrent duplicate (no 500).
--
-- award_points (0056) does a SELECT-then-INSERT keyed on the
-- ux_point_tx_idempotency unique index, with no exception handling.
-- A true race lets two callers both pass the SELECT (neither sees the
-- other's not-yet-committed row), so the 2nd INSERT raises
-- unique_violation, which surfaces to the client as a 500
-- (e.g. redeem-points:124) instead of the intended idempotent 0.
--
-- Fix: wrap the INSERT (+ the dependent profile UPDATE) in a nested
-- block that traps unique_violation and returns 0 — the same value the
-- SELECT fast-path already returns for an already-awarded key. No other
-- behavior changes; signature, return type, security attributes, and
-- grants are identical to 0056 (CREATE OR REPLACE preserves grants).
-- ============================================================

create or replace function public.award_points(
  p_user_id        uuid,
  p_delta          int,
  p_reason         text,
  p_reference      jsonb default '{}'::jsonb,
  p_idempotency_key text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
begin
  if p_idempotency_key is not null then
    select id into v_existing
      from public.point_transactions
     where user_id = p_user_id
       and idempotency_key = p_idempotency_key
     limit 1;
    if v_existing is not null then
      return 0;
    end if;
  end if;

  begin
    insert into public.point_transactions(user_id, delta, reason, reference, idempotency_key)
    values (p_user_id, p_delta, p_reason, p_reference, p_idempotency_key);

    update public.profiles
      set points = greatest(0, points + p_delta),
          points_earned_total = points_earned_total + greatest(0, p_delta)
      where id = p_user_id;

    return p_delta;
  exception when unique_violation then
    -- Concurrent duplicate raced past the SELECT above; treat as no-op.
    return 0;
  end;
end;
$$;
