-- =============================================================================
-- 0201 — award_points is EXECUTE-able by anon/authenticated → free Diamond Points
--        (CRITICAL, finding money-1)                                (2026-07-13)
-- =============================================================================
-- public.award_points(...) is SECURITY DEFINER and its body unconditionally does
--   insert point_transactions(...) + update profiles set points = greatest(0, points + p_delta)
-- for the CALLER-SUPPLIED p_user_id, with NO auth.uid()/is_admin()/caller==target
-- check (see 0147 body). Because it is SECURITY DEFINER it runs owner-privileged
-- and bypasses RLS. Supabase's default GRANT EXECUTE ... TO PUBLIC (anon +
-- authenticated) was never stripped for award_points (0143/0146/0169 revoke other
-- functions but not this one), so any logged-in talent/HM can POST
--   /rest/v1/rpc/award_points {p_user_id:self, p_delta:1000000, p_idempotency_key:<uuid>}
-- to mint a currency that buy-points sells for real RM (and a negative p_delta on
-- a victim's id zeroes their paid balance). This is DISTINCT from the direct
-- `UPDATE profiles` vector already closed by 0186/0187 (that was column grants;
-- award_points writes the columns owner-privileged regardless of column grants).
--
-- FIX: award_points must be service_role-only. Every legitimate caller already
-- invokes it through the service-role adminClient (payment-webhook, award-points,
-- admin-refund) or internally as the function owner (redeem_points_for 0146,
-- 0076/0077) — none of which are affected by a role-level EXECUTE revoke.
--
-- BOTH overloads are locked:
--   * 5-arg (uuid,int,text,jsonb,text) returns int   — current def, 0056/0147
--   * 4-arg (uuid,int,text,jsonb)      returns void   — legacy, 0021 (kept alive
--     by 0056's comment, never dropped). Equally SECURITY DEFINER + unguarded +
--     default-PUBLIC-EXECUTE, so revoking only the 5-arg would leave the 4-arg
--     overload as an identical open vector.
--
-- Idempotent: REVOKE/GRANT are declarative (re-running is a no-op). Matches the
-- direct-statement style of 0143/0169. Author-only — owner must apply.
--
-- ROLLBACK:
--   grant execute on function public.award_points(uuid, int, text, jsonb, text) to anon, authenticated;
--   grant execute on function public.award_points(uuid, int, text, jsonb)       to anon, authenticated;
--   notify pgrst, 'reload schema';
-- =============================================================================

-- 5-arg overload (uuid, int, text, jsonb, text) → int
revoke execute on function public.award_points(uuid, int, text, jsonb, text)
  from anon, authenticated, public;
grant  execute on function public.award_points(uuid, int, text, jsonb, text)
  to service_role;

-- 4-arg legacy overload (uuid, int, text, jsonb) → void
revoke execute on function public.award_points(uuid, int, text, jsonb)
  from anon, authenticated, public;
grant  execute on function public.award_points(uuid, int, text, jsonb)
  to service_role;

-- Refresh PostgREST's schema cache so the revoked EXECUTE takes effect immediately.
notify pgrst, 'reload schema';
