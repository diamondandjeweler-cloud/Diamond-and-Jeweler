-- ============================================================================
-- 0157 — get_pending_match_reasoning(): admin-gated read of the two sensitive
--        match columns (internal_reasoning, life_chart_score)
--
-- CONTEXT (HM IP leak, gated follow-up from docs/AUDIT_2026-06-27.md):
--   matches.internal_reasoning + matches.life_chart_score are SELECT-granted to
--   `authenticated` table-wide. RLS lets a hiring manager read the match rows for
--   their own roles, so an HM can read the internal scoring rationale / life-chart
--   ("team-fit") score for their matched candidates — internal IP that should be
--   admin-only. (Verified live 2026-06-27: both columns granted to authenticated.)
--
--   The blanket column revoke is what 0158 does. But two admin surfaces read
--   these columns AS authenticated and must keep working after the revoke:
--     * MatchPanel.tsx           — already routes through get_admin_matches()
--                                  (0104, SECURITY DEFINER) → already safe.
--     * MatchApprovalPanel.tsx   — reads them via a direct PostgREST embed → this
--                                  RPC is its replacement source for the 2 fields.
--
--   This migration is PURELY ADDITIVE (creates one function, no revoke), so it is
--   safe to apply before the frontend that uses it ships. The column revoke is
--   split into 0158 and applied only AFTER the new frontend is live, leaving no
--   window where a current client breaks.
--
-- Mirrors the get_admin_matches() pattern (0104): is_admin() entry gate, SECURITY
-- DEFINER, flat return shape. Idempotent.
-- ============================================================================

create or replace function public.get_pending_match_reasoning()
returns table (
  match_id           uuid,
  life_chart_score   numeric,
  internal_reasoning jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  -- Admin-only. Non-admins get a clean 403 (matching get_admin_matches), never
  -- a silent empty result that masks an authorization gap.
  if not public.is_admin() then
    raise exception 'get_pending_match_reasoning: not authorized' using errcode = '42501';
  end if;

  return query
    select m.id, m.life_chart_score, m.internal_reasoning
      from public.matches m
     where m.status = 'pending_approval'
     order by m.created_at desc
     limit 500;
end;
$$;

revoke all on function public.get_pending_match_reasoning() from public;
grant execute on function public.get_pending_match_reasoning() to authenticated;

notify pgrst, 'reload schema';
