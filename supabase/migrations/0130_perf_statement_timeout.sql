-- 0130 — Per-role statement_timeout (item 6)
--
-- Prevents runaway queries from holding a connection indefinitely.
-- A single unindexed admin query would otherwise block a connection
-- for the full default timeout (none on managed Supabase).
--
-- anon: 3 s  — public landing, silo pages; queries should be instant
-- authenticated: 8 s  — dashboard, RPCs; most finish well under 2 s
-- service_role: left at default — Edge Functions own their lifecycle
-- postgres (migrations/pg_cron): left at default

ALTER ROLE anon          SET statement_timeout = '3s';
ALTER ROLE authenticated SET statement_timeout = '8s';
