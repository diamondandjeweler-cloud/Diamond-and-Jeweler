-- ============================================================
-- 0146 — Balance-checked redeem RPC (points cannot be over-spent)
--
-- redeem-points (Edge Function) calls db.rpc('redeem_points_for', ...) but
-- the RPC never existed, and the legacy spend path had NO balance check —
-- award_points floors at 0 via greatest(0, points + delta) (0056:51-54), so
-- a redeem could silently take a user negative-and-clamped, spending points
-- the user did not have.
--
-- This mirrors the correct, audited pattern from charge_urgent_priority
-- (0077:61-70): SELECT coalesce(points,0) ... FOR UPDATE to serialise
-- concurrent calls, then RAISE EXCEPTION (errcode P0001) when the balance is
-- short. The actual deduction + point_transactions row + idempotency are
-- delegated to the canonical award_points() (0056) so the spend goes through
-- exactly the same mechanism as every other point movement.
--
-- Returns:
--   n (>= 0) — the new balance after the deduction
--   -1       — idempotency replay (key already recorded) — no double-deduct.
--              -1 (not 0) is used so a legitimate redemption that lands the
--              balance exactly on 0 is NOT mistaken for a replay. The Edge
--              Function maps -1 to a 409 "already redeemed" response.
-- ============================================================

create or replace function public.redeem_points_for(
  p_user_id         uuid,
  p_cost            int,
  p_reason          text,
  p_idempotency_key text
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
  v_awarded int;
begin
  if p_cost is null or p_cost <= 0 then
    raise exception 'invalid cost %', p_cost
      using errcode = '22023';
  end if;

  -- Row-lock the profile so two concurrent redeems serialise on it. The
  -- second call blocks here, then re-reads the now-decremented balance and
  -- correctly fails the balance check below. Lock releases at COMMIT.
  select coalesce(points, 0) into v_balance
    from public.profiles
   where id = p_user_id
   for update;

  if v_balance is null or v_balance < p_cost then
    raise exception 'insufficient_points'
      using errcode = 'P0001';
  end if;

  -- Canonical deduction: award_points inserts the point_transactions row,
  -- enforces the (user_id, idempotency_key) uniqueness, and decrements the
  -- balance. Returns 0 when the key was already recorded (replay) — in that
  -- case nothing was deducted, so we surface 0 unchanged.
  v_awarded := public.award_points(
    p_user_id         => p_user_id,
    p_delta           => -p_cost,
    p_reason          => p_reason,
    p_reference       => jsonb_build_object('redeem', true, 'cost', p_cost),
    p_idempotency_key => p_idempotency_key
  );

  if v_awarded = 0 then
    -- Idempotency replay (award_points returns 0 only when the key already
    -- existed; a fresh award returns p_delta = -p_cost, which is < 0). Return
    -- -1 (never a real balance) so the caller can distinguish a replay from a
    -- legitimate redemption that lands the balance on exactly 0.
    return -1;
  end if;

  return v_balance - p_cost;
end;
$$;

-- Default grants leak EXECUTE to anon + PUBLIC on create; strip those, then
-- grant only the intended roles (mirrors 0143 hygiene).
revoke execute on function public.redeem_points_for(uuid, int, text, text)
  from anon, public;
grant execute on function public.redeem_points_for(uuid, int, text, text)
  to authenticated, service_role;
