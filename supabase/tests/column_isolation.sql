-- ============================================================================
-- Column-isolation gate — BLOCKING in CI.
--
-- WHY SEPARATE FROM rls_deny.sql:
--   This file contains ONLY pure has_column_privilege() catalog assertions — no
--   fixtures, no role impersonation, no transaction/side effects — so it is safe
--   to run as a HARD gate (continue-on-error: false) on the reset DB. The broader
--   fixtured rls_deny.sql suite stays advisory until a green reset run is observed.
--
-- WHAT IT GUARDS (the audit's #1 risk — a 3× recurrence):
--   A table-wide `GRANT SELECT ... TO authenticated` (e.g. migration 0119) silently
--   clobbers the column-level revokes that hide PII (talents.ic_path = NRIC/passport
--   storage path) and proprietary IP (matches.internal_reasoning, life_chart_score).
--   Row-level RLS — every invariant in rls_deny.sql — structurally cannot catch a
--   within-visible-row COLUMN leak. This gate does.
--
-- HOW IT RUNS (.github/workflows/ci.yml db-apply job, after `supabase db reset`):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/column_isolation.sql
--   A failing assertion RAISEs → psql exits non-zero → CI is RED.
--
-- ADD any future sensitive column to the checks below.
-- ============================================================================

do $$
declare
  bad text := '';
begin
  if has_column_privilege('authenticated','public.talents','ic_path','SELECT')           then bad := bad || ' talents.ic_path/authenticated'; end if;
  if has_column_privilege('anon','public.talents','ic_path','SELECT')                     then bad := bad || ' talents.ic_path/anon'; end if;
  if has_column_privilege('authenticated','public.matches','internal_reasoning','SELECT') then bad := bad || ' matches.internal_reasoning/authenticated'; end if;
  if has_column_privilege('anon','public.matches','internal_reasoning','SELECT')          then bad := bad || ' matches.internal_reasoning/anon'; end if;
  if has_column_privilege('authenticated','public.matches','life_chart_score','SELECT')   then bad := bad || ' matches.life_chart_score/authenticated'; end if;
  if has_column_privilege('anon','public.matches','life_chart_score','SELECT')            then bad := bad || ' matches.life_chart_score/anon'; end if;

  if bad <> '' then
    raise exception 'COLUMN-ISOLATION GATE FAILED — sensitive column(s) SELECT-granted (leak):%', bad;
  end if;
  raise notice 'COLUMN-ISOLATION GATE: PASS — ic_path / internal_reasoning / life_chart_score isolated from authenticated + anon';
end;
$$;
