-- ============================================================================
-- 0156 — Re-lock talents.ic_path (PII) + revoke anon SELECT on matches
--
-- REGRESSION (3rd recurrence of the ic_path leak): migration 0119's blanket
--   GRANT SELECT ON public.talents TO authenticated
-- re-exposed talents.ic_path (the storage path to a talent's NRIC/passport scan)
-- to every authenticated user — including a hiring manager looking at a matched
-- candidate — undoing the 0091/0105 column lockdown. No client code reads
-- talents.ic_path directly (IC documents are served only via service-role signed
-- URLs / edge functions), so re-locking the column is non-breaking.
--
-- Separately, anon currently holds SELECT on matches (incl. internal_reasoning,
-- life_chart_score) via a blanket grant. Unauthenticated users have no business
-- reading match rows at all, so revoke the whole table SELECT from anon.
--
-- NOT in this migration (gated follow-up): revoking SELECT on
-- matches.internal_reasoning + life_chart_score from AUTHENTICATED. Those columns
-- are read directly by the admin MatchApprovalPanel.tsx:77 / MatchPanel.tsx, and a
-- blanket column revoke would break admins. The correct fix is to first route
-- those panels through a SECURITY DEFINER admin RPC (is_admin()-gated), then
-- revoke the columns — a coupled frontend+DB change that needs runtime
-- verification. Tracked in docs/AUDIT_2026-06-27.md.
--
-- Idempotent: re-running re-applies the same column grant set.
-- ============================================================================

-- Re-lock ic_path: drop the table-wide SELECT and re-grant SELECT on every
-- CURRENT talents column EXCEPT ic_path. Dynamic so new columns added after this
-- migration stay readable; only ic_path is withheld.
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'talents'
     and column_name <> 'ic_path';

  revoke select on public.talents from authenticated;
  execute format('grant select (%s) on public.talents to authenticated', v_cols);
end $$;

-- anon should never read match rows.
revoke select on public.matches from anon;
