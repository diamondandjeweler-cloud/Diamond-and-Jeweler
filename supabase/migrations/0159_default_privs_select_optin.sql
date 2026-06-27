-- ============================================================================
-- 0159 — Make future-table SELECT opt-in for `authenticated` (close the 0119
--        recurrence vector at the source)
--
-- ROOT CAUSE of the 3× ic_path / internal_reasoning re-exposure:
--   0119 set `ALTER DEFAULT PRIVILEGES ... GRANT SELECT ... ON TABLES TO
--   authenticated`. That makes EVERY new table table-wide SELECT-readable by
--   every authenticated user the moment it is created — so any future table with
--   a sensitive column (an ic_path, an *_encrypted, an internal_*) is silently
--   world-readable to all logged-in users unless a later migration remembers to
--   revoke the column. "Remember to revoke" is exactly what failed three times.
--
-- FIX: flip the default for `authenticated` SELECT from opt-OUT to opt-IN.
--   New tables no longer auto-grant SELECT to authenticated; a readable table
--   must add an explicit, column-scoped `grant select (col, ...) to
--   authenticated`. A forgotten grant now FAILS CLOSED (reads return permission
--   denied — immediately visible in dev) instead of FAILING OPEN (silent leak —
--   invisible until an audit). This is the secure default.
--
-- ZERO impact on existing tables / functionality:
--   * 0119 statement 1 already issued an EXPLICIT table grant to every table that
--     existed then; tables created in 0120–0158 received the default grant AT
--     THEIR creation (while 0119's default was in effect). This migration only
--     changes the default for tables created AFTER it (0160+). Nothing currently
--     readable loses access.
--   * service_role keeps its full default grant (it needs unrestricted access).
--   * INSERT/UPDATE/DELETE defaults are untouched — writes are gated by RLS WITH
--     CHECK, so auto-granting them is not an exposure vector; only SELECT is.
--
-- Belt-and-suspenders: supabase/tests/rls_deny.sql INVARIANT 9 statically asserts
-- the known sensitive columns stay revoked, and (once the CI gate is blocking)
-- catches any explicit re-grant mistake too. This migration removes the silent
-- default; the test catches the explicit slip.
--
-- Idempotent.
-- ============================================================================

alter default privileges in schema public
  revoke select on tables from authenticated;

notify pgrst, 'reload schema';
