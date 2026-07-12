-- =============================================================================
-- 0202 — redeem_points_for is EXECUTE-able by authenticated → cross-user points
--        drain (HIGH, finding money-3)                              (2026-07-13)
-- =============================================================================
-- public.redeem_points_for(p_user_id, p_cost, p_reason, p_idempotency_key) is
-- SECURITY DEFINER (RLS-bypassing) and deducts p_cost from the CALLER-SUPPLIED
-- p_user_id's balance with NO check that the caller owns p_user_id (0146:32-79).
-- 0146:85 granted EXECUTE to `authenticated`, so PostgREST exposes it at
--   /rest/v1/rpc/redeem_points_for
-- to any logged-in JWT. A direct call skips the redeem-points Edge Function
-- entirely (which is the only legitimate caller, and always passes
-- p_user_id = auth.userId via the service-role adminClient), so the edge-only
-- rate limit / ownership / quota checks are bypassed and an attacker can POST
--   {p_user_id:<victim>, p_cost:<victim-balance>, p_idempotency_key:<uuid>}
-- to destroy any other user's (paid) Diamond Points balance.
--
-- FIX: revoke EXECUTE from `authenticated`, leaving the 0146 grant to
-- service_role only — mirrors the sibling money-mutating RPC
-- charge_urgent_priority, which is service_role-only (0077:99). This breaks no
-- legitimate flow: redeem_points_for is only ever invoked by the redeem-points
-- Edge Function through the service-role adminClient.
--
-- Idempotent: REVOKE is declarative (re-running is a no-op). Author-only — owner
-- must apply.
--
-- ROLLBACK:
--   grant execute on function public.redeem_points_for(uuid, int, text, text) to authenticated;
--   notify pgrst, 'reload schema';
-- =============================================================================

revoke execute on function public.redeem_points_for(uuid, int, text, text)
  from authenticated;

-- (grant ... to service_role from 0146 remains in force.)

-- Refresh PostgREST's schema cache so the revoked EXECUTE takes effect immediately.
notify pgrst, 'reload schema';
