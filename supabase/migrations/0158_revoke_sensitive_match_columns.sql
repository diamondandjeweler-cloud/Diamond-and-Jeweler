-- ============================================================================
-- 0158 — Revoke matches.internal_reasoning + matches.life_chart_score from
--        `authenticated` (HM IP leak lockdown)
--
-- Pairs with 0157 (get_pending_match_reasoning) — see that file for the full
-- rationale. Both admin readers are now routed through SECURITY DEFINER RPCs:
--   * MatchPanel.tsx          → get_admin_matches()            (0104)
--   * MatchApprovalPanel.tsx  → get_pending_match_reasoning()  (0157)
-- No other authenticated caller selects these two columns (every other matches
-- read in apps/web enumerates explicit columns and uses public_reasoning, not
-- internal_reasoning; none use select('*')). Edge functions read via the
-- service role and are unaffected by an `authenticated` grant change.
--
-- DEPLOY ORDER (important): apply this migration ONLY AFTER the frontend that
-- uses get_pending_match_reasoning() is live. Applying it earlier would break
-- the still-deployed MatchApprovalPanel embed (which selects both columns) for
-- the ~2 admins until they reload.
--
-- MECHANISM: a single column-level REVOKE is a no-op when the privilege was
-- granted table-wide, so mirror 0156 (ic_path): drop the table-wide SELECT and
-- re-grant SELECT on every CURRENT matches column EXCEPT the two sensitive ones.
-- Dynamic, so columns added later stay readable; only these two are withheld.
-- Idempotent: re-running re-applies the same column grant set.
-- ============================================================================
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'matches'
     and column_name not in ('internal_reasoning', 'life_chart_score');

  revoke select on public.matches from authenticated;
  execute format('grant select (%s) on public.matches to authenticated', v_cols);
end $$;

notify pgrst, 'reload schema';
